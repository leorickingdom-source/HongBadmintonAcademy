import { env } from "@/lib/env";
import { monthLabel } from "@/lib/format";
import { studentRank } from "@/lib/ranks";

export interface Analytics {
  monthLabel: string;
  currency: string;
  counts: { students: number; coaches: number; parents: number; classes: number };
  revenueThisMonth: number;
  outstanding: number;
  attendanceRate: number | null;
  attendanceBreakdown: { present: number; late: number; absent: number; excused: number };
  avgScore: number | null;
  assessmentCount: number;
  invoiceStatus: Record<string, number>;
  messageStatus: Record<string, number>;
  topStudents: { name: string; points: number }[];
  newStudentsThisMonth: number;
  revenueTrend: { label: string; amount: number }[];
  studentsPerClass: { name: string; count: number }[];
  rankDistribution: Record<string, number>;
  collection: { billed: number; collected: number; rate: number | null };
}

// Computes the academy analytics. Pass an authed Supabase client (admin RLS
// gives full reads). Shared by the analytics page and the PDF export.
export async function computeAnalytics(supabase: any, month: Date = new Date()): Promise<Analytics> {
  const now = month;
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

  const head = (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    return q;
  };

  const [
    students, coaches, parents, classes, newStudents,
    { data: payments },
    { data: trendPayments },
    { data: invoices },
    { data: attendance },
    { data: assessments },
    { data: ledger },
    { data: messages },
    { data: activeEnrollments },
    { data: activeStudents },
  ] = await Promise.all([
    head("students", (q: any) => q.eq("status", "active")),
    head("profiles", (q: any) => q.eq("role", "coach")),
    head("profiles", (q: any) => q.eq("role", "parent")),
    head("classes", (q: any) => q.eq("is_active", true)),
    head("students", (q: any) => q.gte("created_at", monthStart)),
    supabase.from("payments").select("amount, status, created_at").gte("created_at", monthStart).eq("status", "succeeded"),
    supabase.from("payments").select("amount, created_at").gte("created_at", trendStart).eq("status", "succeeded").limit(10000),
    supabase.from("invoices").select("amount, status, period_month"),
    supabase.from("attendance").select("status").limit(10000),
    supabase.from("assessments").select("overall_score").limit(10000),
    supabase.from("reward_ledger").select("points, students(full_name)").limit(10000),
    supabase.from("messages").select("status").limit(10000),
    supabase.from("enrollments").select("student_id, classes(name, level)").eq("active", true).limit(10000),
    supabase.from("students").select("id, rank").eq("status", "active").limit(10000),
  ]);

  const revenueThisMonth = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);

  const invoiceStatus: Record<string, number> = {};
  let outstanding = 0;
  for (const i of invoices ?? []) {
    invoiceStatus[i.status] = (invoiceStatus[i.status] ?? 0) + 1;
    if (i.status === "unpaid" || i.status === "overdue") outstanding += Number(i.amount);
  }

  const attendanceBreakdown = { present: 0, late: 0, absent: 0, excused: 0 };
  for (const a of attendance ?? []) {
    if (a.status in attendanceBreakdown) (attendanceBreakdown as any)[a.status]++;
  }
  const attTotal = (attendance ?? []).length;
  const attended = attendanceBreakdown.present + attendanceBreakdown.late;
  const attendanceRate = attTotal ? Math.round((attended / attTotal) * 100) : null;

  const scores = (assessments ?? []).map((a: any) => Number(a.overall_score)).filter((n: number) => !Number.isNaN(n));
  const avgScore = scores.length ? Math.round((scores.reduce((x: number, y: number) => x + y, 0) / scores.length) * 10) / 10 : null;

  const pointsByStudent = new Map<string, number>();
  for (const r of ledger ?? []) {
    const name = r.students?.full_name ?? "—";
    pointsByStudent.set(name, (pointsByStudent.get(name) ?? 0) + Number(r.points));
  }
  const topStudents = [...pointsByStudent.entries()]
    .map(([name, points]) => ({ name, points }))
    .sort((a, b) => b.points - a.points)
    .slice(0, 5);

  const messageStatus: Record<string, number> = {};
  for (const m of messages ?? []) messageStatus[m.status] = (messageStatus[m.status] ?? 0) + 1;

  // Revenue trend — last 6 months of succeeded payments, bucketed by month.
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-MY", { month: "short" }), amount: 0 };
  });
  const monthIdx = new Map(months.map((m, i) => [m.key, i]));
  for (const p of trendPayments ?? []) {
    const d = new Date(p.created_at);
    const i = monthIdx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i != null) months[i].amount += Number(p.amount);
  }
  const revenueTrend = months.map((m) => ({ label: m.label, amount: Math.round(m.amount) }));

  // Active enrolment headcount per class.
  const perClass = new Map<string, number>();
  for (const e of (activeEnrollments ?? []) as any[]) {
    const name = e.classes?.name;
    if (!name) continue;
    perClass.set(name, (perClass.get(name) ?? 0) + 1);
  }
  const studentsPerClass = [...perClass.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // Class-rank distribution across active students (effective rank).
  const levelsByStudent = new Map<string, (string | null)[]>();
  for (const e of (activeEnrollments ?? []) as any[]) {
    const arr = levelsByStudent.get(e.student_id) ?? [];
    arr.push(e.classes?.level ?? null);
    levelsByStudent.set(e.student_id, arr);
  }
  const rankDistribution: Record<string, number> = { Beginner: 0, Intermediate: 0, Advanced: 0, Elite: 0, Unranked: 0 };
  for (const s of (activeStudents ?? []) as any[]) {
    const r = studentRank(s.rank, levelsByStudent.get(s.id) ?? []);
    rankDistribution[r ?? "Unranked"] = (rankDistribution[r ?? "Unranked"] ?? 0) + 1;
  }

  // Collection rate for the current month: collected ÷ billed (excl. canceled/refunded).
  const mk = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  let billed = 0;
  let collected = 0;
  for (const i of (invoices ?? []) as any[]) {
    if (!i.period_month || !String(i.period_month).startsWith(mk)) continue;
    if (i.status === "canceled" || i.status === "refunded") continue;
    billed += Number(i.amount);
    if (i.status === "paid") collected += Number(i.amount);
  }
  const collection = {
    billed: Math.round(billed),
    collected: Math.round(collected),
    rate: billed ? Math.round((collected / billed) * 100) : null,
  };

  return {
    monthLabel: monthLabel(monthStart),
    currency: env.paymentCurrency,
    counts: {
      students: students.count ?? 0,
      coaches: coaches.count ?? 0,
      parents: parents.count ?? 0,
      classes: classes.count ?? 0,
    },
    revenueThisMonth,
    outstanding,
    attendanceRate,
    attendanceBreakdown,
    avgScore,
    assessmentCount: scores.length,
    invoiceStatus,
    messageStatus,
    topStudents,
    newStudentsThisMonth: newStudents.count ?? 0,
    revenueTrend,
    studentsPerClass,
    rankDistribution,
    collection,
  };
}
