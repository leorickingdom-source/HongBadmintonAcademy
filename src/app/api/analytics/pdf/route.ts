import { NextResponse } from "next/server";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { computeAnalytics } from "@/lib/analytics";
import { formatCurrency } from "@/lib/format";
import { APP_NAME } from "@/lib/constants";

export const runtime = "nodejs";

const BRAND = rgb(0.086, 0.639, 0.29);
const INK = rgb(0.059, 0.09, 0.165);
const MUTED = rgb(0.42, 0.45, 0.5);
const WHITE = rgb(1, 1, 1);

export async function GET(req: Request) {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createClient();
  const monthParam = new URL(req.url).searchParams.get("month");
  const valid = monthParam && /^\d{4}-\d{2}$/.test(monthParam);
  const monthDate = valid
    ? new Date(Number(monthParam!.slice(0, 4)), Number(monthParam!.slice(5, 7)) - 1, 1)
    : new Date();
  const monthSlug = valid ? monthParam! : new Date().toISOString().slice(0, 7);
  const a = await computeAnalytics(supabase, monthDate);

  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]);
  const W = page.getWidth();
  const H = page.getHeight();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 48;
  const t = (s: string, x: number, y: number, size: number, f = font, c = INK) =>
    page.drawText(s, { x, y, size, font: f, color: c });

  page.drawRectangle({ x: 0, y: H - 100, width: W, height: 100, color: BRAND });
  t(APP_NAME, M, H - 50, 20, bold, WHITE);
  t(`Analytics — ${a.monthLabel}`, M, H - 74, 12, font, WHITE);
  const dateStr = new Date().toLocaleDateString("en-MY", { dateStyle: "long" });
  t(dateStr, W - M - font.widthOfTextAtSize(dateStr, 11), H - 74, 11, font, WHITE);

  let y = H - 140;
  const row = (label: string, value: string) => {
    t(label, M, y, 11, font, MUTED);
    t(value, M + 240, y, 12, bold, INK);
    y -= 22;
  };
  const heading = (s: string) => {
    y -= 8;
    t(s, M, y, 13, bold, BRAND);
    y -= 6;
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 1, color: rgb(0.89, 0.91, 0.93) });
    y -= 20;
  };

  heading("Finance");
  row("Revenue this month", formatCurrency(a.revenueThisMonth, a.currency));
  row("Collection rate", a.collection.rate != null ? `${a.collection.rate}%` : "—");
  row("Outstanding fees", formatCurrency(a.outstanding, a.currency));
  row("Fee aging 0/31/61/90+", `${formatCurrency(a.feeAging.d0, a.currency)} · ${formatCurrency(a.feeAging.d30, a.currency)} · ${formatCurrency(a.feeAging.d60, a.currency)} · ${formatCurrency(a.feeAging.d90, a.currency)}`);

  heading("Engagement");
  row("Attendance rate", a.attendanceRate != null ? `${a.attendanceRate}%` : "—");
  row("Retention (30 days)", a.retention.rate != null ? `${a.retention.rate}%` : "—");
  row("Avg attendance / student", a.retention.avgAttendancePct != null ? `${a.retention.avgAttendancePct}%` : "—");
  row("Avg exam score", a.avgScore != null ? `${a.avgScore}/100 (${a.assessmentCount} exams this year)` : "—");
  row("Exam score change", a.skillImprovement != null ? `${a.skillImprovement >= 0 ? "+" : ""}${a.skillImprovement} pts vs last yr` : "—");
  row("Class occupancy (avg)", a.avgOccupancyPct != null ? `${a.avgOccupancyPct}%` : "—");
  row("Attendance", `present ${a.attendanceBreakdown.present} · late ${a.attendanceBreakdown.late} · absent ${a.attendanceBreakdown.absent} · excused ${a.attendanceBreakdown.excused}`);

  heading("People");
  row("Active students", String(a.counts.students));
  row("New / Inactive this month", `${a.newStudentsThisMonth} new · ${a.inactiveStudents} inactive`);
  row("Coaches / Parents", `${a.counts.coaches} / ${a.counts.parents}`);
  row("Active classes", String(a.counts.classes));

  heading("Coach performance (this month)");
  if (a.coachPerformance.length === 0) row("—", "no coaches");
  a.coachPerformance.forEach((c) =>
    row(c.name, `${c.students} students · ${c.attendancePct ?? "—"}% att · ${c.avgSkill ?? "—"}/100 avg exam`),
  );

  heading("Invoices by status");
  for (const [k, v] of Object.entries(a.invoiceStatus)) row(k, String(v));

  heading("Reward leaderboard");
  if (a.topStudents.length === 0) row("—", "no rewards yet");
  a.topStudents.forEach((s, i) => row(`${i + 1}. ${s.name}`, `${s.points} pts`));

  page.drawLine({ start: { x: M, y: 60 }, end: { x: W - M, y: 60 }, thickness: 1, color: rgb(0.89, 0.91, 0.93) });
  t(`Generated ${new Date().toISOString()}`, M, 46, 9, font, MUTED);

  const bytes = await doc.save();
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="hba-analytics-${monthSlug}.pdf"`,
    },
  });
}
