import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";

export const runtime = "nodejs";

function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return "";
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(","),
    ...rows.map((r) => headers.map((h) => esc(r[h])).join(",")),
  ].join("\n");
}

// CSV export for admins.  /api/export?type=students|invoices|payments|attendance
export async function GET(req: NextRequest) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get("type") ?? "students";
  const supabase = await createClient();
  let rows: Record<string, unknown>[] = [];

  if (type === "students") {
    const { data } = await supabase
      .from("students")
      .select("full_name, status, nfc_tag_uid, dob, parent:profiles!students_parent_id_fkey(full_name)")
      .order("full_name");
    rows = (data ?? []).map((s: any) => ({
      name: s.full_name, status: s.status, nfc_tag: s.nfc_tag_uid ?? "",
      dob: s.dob ?? "", parent: s.parent?.full_name ?? "",
    }));
  } else if (type === "invoices") {
    const { data } = await supabase
      .from("invoices")
      .select("invoice_no, amount, currency, status, due_date, paid_at, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name)")
      .order("created_at", { ascending: false });
    rows = (data ?? []).map((i: any) => ({
      invoice_no: i.invoice_no ?? "", student: i.students?.full_name ?? "",
      parent: i.parent?.full_name ?? "", amount: i.amount, currency: i.currency,
      status: i.status, due_date: i.due_date ?? "", paid_at: i.paid_at ?? "",
    }));
  } else if (type === "payments") {
    const { data } = await supabase
      .from("payments")
      .select("created_at, amount, currency, provider, status, invoices(invoice_no)")
      .order("created_at", { ascending: false });
    rows = (data ?? []).map((p: any) => ({
      date: p.created_at, invoice_no: p.invoices?.invoice_no ?? "",
      amount: p.amount, currency: p.currency, provider: p.provider, status: p.status,
    }));
  } else if (type === "attendance") {
    const { data } = await supabase
      .from("attendance")
      .select("status, tap_in_at, tap_out_at, students(full_name), sessions(session_date, classes(name))")
      .order("created_at", { ascending: false })
      .limit(5000);
    rows = (data ?? []).map((a: any) => ({
      date: a.sessions?.session_date ?? "", class: a.sessions?.classes?.name ?? "",
      student: a.students?.full_name ?? "", status: a.status,
      tap_in: a.tap_in_at ?? "", tap_out: a.tap_out_at ?? "",
    }));
  } else {
    return NextResponse.json({ error: "Unknown export type" }, { status: 400 });
  }

  const csv = toCsv(rows);
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hba-${type}-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
