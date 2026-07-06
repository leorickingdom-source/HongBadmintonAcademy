import { NextResponse, type NextRequest } from "next/server";
import { PDFDocument, StandardFonts, rgb, type PDFFont } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { buildXlsx } from "@/lib/xlsx";
import { APP_NAME } from "@/lib/constants";

export const runtime = "nodejs";

type Dataset = { title: string; headers: string[]; rows: (string | number)[][] };

function csv(headers: string[], rows: (string | number)[][]): string {
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

// Simple paginated table PDF.
async function tablePdf({ title, headers, rows }: Dataset): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const BRAND = rgb(0.086, 0.639, 0.29);
  const INK = rgb(0.1, 0.12, 0.16);
  const LINE = rgb(0.85, 0.87, 0.9);
  const HEADBG = rgb(0.95, 0.97, 0.93);

  const W = 841.89, H = 595.28; // A4 landscape (more columns fit)
  const M = 36;
  const size = 8;
  const rowH = 15;
  const colW = (W - M * 2) / headers.length;

  const fit = (s: string, f: PDFFont, max: number) => {
    let t = s ?? "";
    if (f.widthOfTextAtSize(t, size) <= max) return t;
    while (t.length > 1 && f.widthOfTextAtSize(t + "…", size) > max) t = t.slice(0, -1);
    return t + "…";
  };

  let page = doc.addPage([W, H]);
  let y = 0;

  const drawHeader = () => {
    page.drawRectangle({ x: 0, y: H - 56, width: W, height: 56, color: BRAND });
    page.drawText(APP_NAME, { x: M, y: H - 30, size: 14, font: bold, color: rgb(1, 1, 1) });
    page.drawText(title, { x: M, y: H - 46, size: 9, font, color: rgb(1, 1, 1) });
    const d = new Date().toLocaleDateString("en-MY", { dateStyle: "long" });
    page.drawText(d, { x: W - M - font.widthOfTextAtSize(d, 9), y: H - 46, size: 9, font, color: rgb(1, 1, 1) });
    y = H - 56 - rowH;
    drawRow(headers, bold, HEADBG);
  };

  function drawRow(cells: (string | number)[], f: PDFFont, bg?: ReturnType<typeof rgb>) {
    if (bg) page.drawRectangle({ x: M, y: y - 3, width: W - M * 2, height: rowH, color: bg });
    cells.forEach((c, i) => {
      page.drawText(fit(String(c ?? ""), f, colW - 8), { x: M + i * colW + 4, y: y + 1, size, font: f, color: INK });
    });
    page.drawLine({ start: { x: M, y: y - 3 }, end: { x: W - M, y: y - 3 }, thickness: 0.5, color: LINE });
    y -= rowH;
  }

  drawHeader();
  for (const r of rows) {
    if (y < M + rowH) {
      page = doc.addPage([W, H]);
      drawHeader();
    }
    drawRow(r, font);
  }
  if (rows.length === 0) {
    page.drawText("No records.", { x: M, y: y - 4, size, font, color: INK });
  }

  return doc.save();
}

async function dataset(type: string, supabase: any): Promise<Dataset | null> {
  if (type === "students") {
    const { data } = await supabase
      .from("students")
      .select("full_name, status, nfc_tag_uid, dob, parent:profiles!students_parent_id_fkey(full_name)")
      .order("full_name");
    return {
      title: "Students",
      headers: ["Name", "Status", "NFC tag", "DOB", "Parent"],
      rows: (data ?? []).map((s: any) => [s.full_name, s.status, s.nfc_tag_uid ?? "", s.dob ?? "", s.parent?.full_name ?? ""]),
    };
  }
  if (type === "invoices") {
    const { data } = await supabase
      .from("invoices")
      .select("invoice_no, amount, currency, status, due_date, paid_at, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name)")
      .order("created_at", { ascending: false });
    return {
      title: "Invoices",
      headers: ["Invoice #", "Student", "Parent", "Amount", "Currency", "Status", "Due", "Paid at"],
      rows: (data ?? []).map((i: any) => [i.invoice_no ?? "", i.students?.full_name ?? "", i.parent?.full_name ?? "", Number(i.amount), i.currency, i.status, i.due_date ?? "", i.paid_at ?? ""]),
    };
  }
  if (type === "payments") {
    const { data } = await supabase
      .from("payments")
      .select("created_at, amount, currency, provider, status, invoices(invoice_no)")
      .order("created_at", { ascending: false });
    return {
      title: "Payments",
      headers: ["Date", "Invoice #", "Amount", "Currency", "Provider", "Status"],
      rows: (data ?? []).map((p: any) => [p.created_at ?? "", p.invoices?.invoice_no ?? "", Number(p.amount), p.currency, p.provider, p.status]),
    };
  }
  if (type === "attendance") {
    const { data } = await supabase
      .from("attendance")
      .select("status, tap_in_at, tap_out_at, students(full_name), sessions(session_date, classes(name))")
      .order("created_at", { ascending: false })
      .limit(5000);
    return {
      title: "Attendance",
      headers: ["Date", "Class", "Student", "Status", "Tap in", "Tap out"],
      rows: (data ?? []).map((a: any) => [a.sessions?.session_date ?? "", a.sessions?.classes?.name ?? "", a.students?.full_name ?? "", a.status, a.tap_in_at ?? "", a.tap_out_at ?? ""]),
    };
  }
  return null;
}

// /api/export?type=students|invoices|payments|attendance&format=csv|xlsx|pdf
export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin" && profile.role !== "super_admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "students";
  // Financial extracts (revenue) are super-admin only; branch admins get the
  // non-financial datasets they can already see in the app.
  if (profile.role !== "super_admin" && (type === "invoices" || type === "payments")) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const format = req.nextUrl.searchParams.get("format") ?? "csv";
  const supabase = await createClient();
  const ds = await dataset(type, supabase);
  if (!ds) return NextResponse.json({ error: "Unknown export type" }, { status: 400 });

  const stamp = new Date().toISOString().slice(0, 10);
  const base = `hba-${type}-${stamp}`;

  if (format === "xlsx") {
    const buf = buildXlsx(ds.headers, ds.rows);
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${base}.xlsx"`,
      },
    });
  }

  if (format === "pdf") {
    const bytes = await tablePdf(ds);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${base}.pdf"`,
      },
    });
  }

  return new NextResponse(csv(ds.headers, ds.rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${base}.csv"`,
    },
  });
}
