import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getProfile } from "@/lib/auth";
import { computeAnalytics } from "@/lib/analytics";

export const runtime = "nodejs";

function esc(v: string | number): string {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

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

  const rows: [string, string | number][] = [
    ["Metric", "Value"],
    ["Month", a.monthLabel],
    ["Currency", a.currency],
    ["Revenue", a.revenueThisMonth],
    ["Outstanding fees", a.outstanding],
    ["Collection rate %", a.collection.rate ?? ""],
    ["Collected (month)", a.collection.collected],
    ["Billed (month)", a.collection.billed],
    ["Attendance rate %", a.attendanceRate ?? ""],
    ["Avg skill score %", a.avgScore ?? ""],
    ["Assessments", a.assessmentCount],
    ["Active students", a.counts.students],
    ["New students (month)", a.newStudentsThisMonth],
    ["Coaches", a.counts.coaches],
    ["Parents", a.counts.parents],
    ["Active classes", a.counts.classes],
    ["Attendance · present", a.attendanceBreakdown.present],
    ["Attendance · late", a.attendanceBreakdown.late],
    ["Attendance · absent", a.attendanceBreakdown.absent],
    ["Attendance · excused", a.attendanceBreakdown.excused],
  ];
  for (const [k, v] of Object.entries(a.invoiceStatus)) rows.push([`Invoices · ${k}`, v]);
  for (const [k, v] of Object.entries(a.rankDistribution)) rows.push([`Rank · ${k}`, v]);
  for (const c of a.studentsPerClass) rows.push([`Class · ${c.name}`, c.count]);
  for (const s of a.topStudents) rows.push([`Reward · ${s.name}`, s.points]);

  const csv = rows.map((r) => r.map(esc).join(",")).join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="hba-analytics-${monthSlug}.csv"`,
    },
  });
}
