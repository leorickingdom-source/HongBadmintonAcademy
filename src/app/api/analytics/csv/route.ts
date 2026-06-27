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
    ["Retention (30d) %", a.retention.rate ?? ""],
    ["Avg attendance/student %", a.retention.avgAttendancePct ?? ""],
    ["No-show >30 days", a.retention.inactive30],
    ["Avg exam score /100", a.avgScore ?? ""],
    ["Exam score change vs last yr", a.skillImprovement ?? ""],
    ["Exams this year", a.assessmentCount],
    ["Active students", a.counts.students],
    ["New students (month)", a.newStudentsThisMonth],
    ["Inactive students", a.inactiveStudents],
    ["Coaches", a.counts.coaches],
    ["Parents", a.counts.parents],
    ["Active classes", a.counts.classes],
    ["Class occupancy avg %", a.avgOccupancyPct ?? ""],
    ["Attendance · present", a.attendanceBreakdown.present],
    ["Attendance · late", a.attendanceBreakdown.late],
    ["Attendance · absent", a.attendanceBreakdown.absent],
    ["Attendance · excused", a.attendanceBreakdown.excused],
    ["Fee aging · 0-30 days", a.feeAging.d0],
    ["Fee aging · 31-60 days", a.feeAging.d30],
    ["Fee aging · 61-90 days", a.feeAging.d60],
    ["Fee aging · 90+ days", a.feeAging.d90],
  ];
  for (const [k, v] of Object.entries(a.invoiceStatus)) rows.push([`Invoices · ${k}`, v]);
  for (const [k, v] of Object.entries(a.rankDistribution)) rows.push([`Level · ${k}`, v]);
  for (const s of a.skillsBreakdown) rows.push([`Exam section · ${s.name} %`, s.pct]);
  for (const c of a.coachPerformance) rows.push([`Coach · ${c.name} (students/att%/exam-100)`, `${c.students} / ${c.attendancePct ?? "-"} / ${c.avgSkill ?? "-"}`]);
  for (const c of a.classOccupancy) rows.push([`Occupancy · ${c.name}`, `${c.enrolled}/${c.capacity} (${c.pct}%)`]);
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
