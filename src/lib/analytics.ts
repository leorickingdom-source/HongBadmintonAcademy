import { env } from "@/lib/env";
import { monthLabel } from "@/lib/format";
import { LEVEL_NAMES, levelName } from "@/lib/training";

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
  skillImprovement: number | null; // percentage-point change vs previous month
  skillsBreakdown: { name: string; pct: number }[];
  invoiceStatus: Record<string, number>;
  messageStatus: Record<string, number>;
  topStudents: { id: string; name: string; points: number }[];
  rewardPeriod: string;
  newStudentsThisMonth: number;
  inactiveStudents: number;
  revenueTrend: { label: string; amount: number }[];
  newStudentTrend: { label: string; count: number }[];
  studentsPerClass: { name: string; count: number }[];
  rankDistribution: Record<string, number>;
  collection: { billed: number; collected: number; rate: number | null };
  courtRentalCost: number; // what the academy paid to rent courts this month
  netRevenue: number; // revenue collected − court rental cost
  retention: { rate: number | null; avgAttendancePct: number | null; inactive30: number };
  coachPerformance: { id: string; name: string; students: number; attendancePct: number | null; avgSkill: number | null }[];
  classOccupancy: { id: string; name: string; enrolled: number; capacity: number; pct: number }[];
  avgOccupancyPct: number | null;
  feeAging: { d0: number; d30: number; d60: number; d90: number };
  // Trial-lead funnel for the month (public /trial intake → enrolment).
  trialFunnel: { new: number; contacted: number; trial_booked: number; trialed: number; enrolled: number; lost: number; total: number; convRate: number | null };
}

const DAY = 24 * 60 * 60 * 1000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const round1 = (n: number) => Math.round(n * 10) / 10;

// Academy analytics for the month containing `month` (defaults to now). Pass an
// authed/admin or service-role Supabase client. `branchId` narrows every metric
// to one branch (super-admin switcher); branch-admins are already RLS-scoped so
// they pass null and still only see their own branch.
export async function computeAnalytics(supabase: any, month: Date = new Date(), branchId: string | null = null): Promise<Analytics> {
  const now = month;
  const mStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const mEnd = new Date(now.getFullYear(), now.getMonth() + 1, 1); // exclusive
  const prevStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const trendStart = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const monthStartISO = mStart.toISOString();
  const monthKey = ymd(mStart).slice(0, 7);
  const real = new Date(); // "now" for current-state metrics (inactivity, aging)
  const today = ymd(real);
  const cutoff30 = ymd(new Date(real.getTime() - 30 * DAY));

  const head = (table: string, filter?: (q: any) => any) => {
    let q = supabase.from(table).select("*", { count: "exact", head: true });
    if (filter) q = filter(q);
    return q;
  };
  // Apply a direct branch_id filter when scoping to one branch.
  const B = (q: any) => (branchId ? q.eq("branch_id", branchId) : q);

  const [
    coaches, parents,
    { data: payments },
    { data: trendPayments },
    { data: invoices },
    { data: attendance },
    { data: examsYear },
    { data: examsPrevYear },
    { data: ledger },
    { data: messages },
    { data: activeEnrollments },
    { data: activeStudents },
    { data: allStudents },
    { data: classesFull },
    { data: classCoaches },
    { data: coachRows },
    { data: rentalRows },
    { data: leadRows },
  ] = await Promise.all([
    head("profiles", (q: any) => B(q.eq("role", "coach"))),
    head("profiles", (q: any) => q.eq("role", "parent")),
    branchId
      ? supabase.from("payments").select("amount, status, created_at, invoices!inner(branch_id)").eq("invoices.branch_id", branchId).gte("created_at", monthStartISO).lt("created_at", mEnd.toISOString()).eq("status", "succeeded")
      : supabase.from("payments").select("amount, status, created_at").gte("created_at", monthStartISO).lt("created_at", mEnd.toISOString()).eq("status", "succeeded"),
    branchId
      ? supabase.from("payments").select("amount, created_at, invoices!inner(branch_id)").eq("invoices.branch_id", branchId).gte("created_at", trendStart.toISOString()).eq("status", "succeeded").limit(10000)
      : supabase.from("payments").select("amount, created_at").gte("created_at", trendStart.toISOString()).eq("status", "succeeded").limit(10000),
    B(supabase.from("invoices").select("amount, status, period_month, due_date")),
    branchId
      ? supabase.from("attendance").select("student_id, status, sessions!inner(session_date, class_id, branch_id)").eq("sessions.branch_id", branchId).limit(20000)
      : supabase.from("attendance").select("student_id, status, sessions(session_date, class_id)").limit(20000),
    branchId
      ? supabase.from("level_exams").select("coach_id, total, technical, footwork, tactical, physical, students!inner(branch_id)").eq("students.branch_id", branchId).gte("exam_date", `${now.getFullYear()}-01-01`).lt("exam_date", `${now.getFullYear() + 1}-01-01`).limit(10000)
      : supabase.from("level_exams").select("coach_id, total, technical, footwork, tactical, physical").gte("exam_date", `${now.getFullYear()}-01-01`).lt("exam_date", `${now.getFullYear() + 1}-01-01`).limit(10000),
    branchId
      ? supabase.from("level_exams").select("total, students!inner(branch_id)").eq("students.branch_id", branchId).gte("exam_date", `${now.getFullYear() - 1}-01-01`).lt("exam_date", `${now.getFullYear()}-01-01`).limit(10000)
      : supabase.from("level_exams").select("total").gte("exam_date", `${now.getFullYear() - 1}-01-01`).lt("exam_date", `${now.getFullYear()}-01-01`).limit(10000),
    branchId
      ? supabase.from("reward_ledger").select("points, student_id, students!inner(full_name, branch_id)").eq("students.branch_id", branchId).gte("awarded_at", monthStartISO).lt("awarded_at", mEnd.toISOString()).limit(10000)
      : supabase.from("reward_ledger").select("points, student_id, students(full_name)").gte("awarded_at", monthStartISO).lt("awarded_at", mEnd.toISOString()).limit(10000),
    supabase.from("messages").select("status").limit(10000),
    branchId
      ? supabase.from("enrollments").select("student_id, class_id, classes!inner(name, level, capacity, branch_id)").eq("classes.branch_id", branchId).eq("active", true).limit(10000)
      : supabase.from("enrollments").select("student_id, class_id, classes(name, level, capacity)").eq("active", true).limit(10000),
    B(supabase.from("students").select("id, level").eq("status", "active").limit(10000)),
    B(supabase.from("students").select("id, status, created_at").limit(10000)),
    B(supabase.from("classes").select("id, name, capacity, coach_id").eq("is_active", true)),
    branchId
      ? supabase.from("class_coaches").select("class_id, coach_id, classes!inner(branch_id)").eq("classes.branch_id", branchId)
      : supabase.from("class_coaches").select("class_id, coach_id"),
    B(supabase.from("profiles").select("id, full_name").eq("role", "coach").eq("is_active", true)),
    // Court rental cost for the month (super-admin only via RLS — non-super
    // callers just get 0 rows, so this stays 0 for them).
    B(supabase.from("court_rentals").select("amount, branch_id").gte("rental_date", ymd(mStart)).lt("rental_date", ymd(mEnd))),
    // Trial leads created this month, for the intake→enrolment funnel.
    B(supabase.from("trial_leads").select("status, branch_id").gte("created_at", monthStartISO).lt("created_at", mEnd.toISOString()).limit(10000)),
  ]);

  const activeStudentIds = new Set<string>((activeStudents ?? []).map((s: any) => String(s.id)));
  const revenueThisMonth = (payments ?? []).reduce((s: number, p: any) => s + Number(p.amount), 0);

  // ── Invoices: status counts, outstanding, fee aging ───────────────────────
  const invoiceStatus: Record<string, number> = {};
  let outstanding = 0;
  const feeAging = { d0: 0, d30: 0, d60: 0, d90: 0 };
  for (const i of invoices ?? []) {
    invoiceStatus[i.status] = (invoiceStatus[i.status] ?? 0) + 1;
    if (i.status === "unpaid" || i.status === "overdue") {
      const amt = Number(i.amount);
      outstanding += amt;
      const days = i.due_date ? Math.floor((real.getTime() - new Date(i.due_date).getTime()) / DAY) : 0;
      if (days <= 30) feeAging.d0 += amt;
      else if (days <= 60) feeAging.d30 += amt;
      else if (days <= 90) feeAging.d60 += amt;
      else feeAging.d90 += amt;
    }
  }
  feeAging.d0 = Math.round(feeAging.d0); feeAging.d30 = Math.round(feeAging.d30);
  feeAging.d60 = Math.round(feeAging.d60); feeAging.d90 = Math.round(feeAging.d90);

  // ── Attendance: breakdown, overall rate, per-student (retention) ──────────
  const attendanceBreakdown = { present: 0, late: 0, absent: 0, excused: 0 };
  const perStudent = new Map<string, { att: number; marked: number; last: string }>();
  const coachAtt = new Map<string, { att: number; total: number }>(); // class_id → tally (month)
  for (const a of attendance ?? []) {
    if (a.status in attendanceBreakdown) (attendanceBreakdown as any)[a.status]++;
    const date = (a as any).sessions?.session_date as string | undefined;
    const e = perStudent.get(a.student_id) ?? { att: 0, marked: 0, last: "" };
    e.marked++;
    if (a.status === "present" || a.status === "late") e.att++;
    if (date && date > e.last) e.last = date;
    perStudent.set(a.student_id, e);
    // per-class this-month tally for coach attendance
    const cid = (a as any).sessions?.class_id;
    if (cid && date && date >= ymd(mStart) && date < ymd(mEnd)) {
      const c = coachAtt.get(cid) ?? { att: 0, total: 0 };
      c.total++;
      if (a.status === "present" || a.status === "late") c.att++;
      coachAtt.set(cid, c);
    }
  }
  const attTotal = (attendance ?? []).length;
  const attended = attendanceBreakdown.present + attendanceBreakdown.late;
  const attendanceRate = attTotal ? Math.round((attended / attTotal) * 100) : null;

  // Retention: of active students, how many attended in the last 30 days.
  let attendedRecently = 0;
  let inactive30 = 0;
  const rates: number[] = [];
  for (const id of activeStudentIds) {
    const e = perStudent.get(id);
    if (e && e.marked) rates.push((e.att / e.marked) * 100);
    if (e && e.last && e.last >= cutoff30) attendedRecently++;
    else inactive30++;
  }
  const activeCount = activeStudentIds.size;
  const retention = {
    rate: activeCount ? Math.round((attendedRecently / activeCount) * 100) : null,
    avgAttendancePct: rates.length ? Math.round(rates.reduce((x, y) => x + y, 0) / rates.length) : null,
    inactive30,
  };

  // ── Exam scores: this-year avg, improvement vs last year, section breakdown ──
  // (Promotion exams run quarterly, so the window is the calendar year, not the
  // month — see src/lib/training.ts EXAM_MONTHS.)
  const yearTotals = (examsYear ?? []).map((e: any) => Number(e.total)).filter((n: number) => !Number.isNaN(n));
  const avgScore = yearTotals.length ? round1(yearTotals.reduce((x: number, y: number) => x + y, 0) / yearTotals.length) : null;
  const prevTotals = (examsPrevYear ?? []).map((e: any) => Number(e.total)).filter((n: number) => !Number.isNaN(n));
  const avgPrev = prevTotals.length ? prevTotals.reduce((x: number, y: number) => x + y, 0) / prevTotals.length : null;
  const skillImprovement = avgScore != null && avgPrev != null ? round1(avgScore - avgPrev) : null;

  // Average % per exam section across this year's exams (Technical 40 / Footwork
  // 25 / Game-Tactical 20 / Physical-Attitude 15).
  const SECTIONS: { key: "technical" | "footwork" | "tactical" | "physical"; name: string; max: number }[] = [
    { key: "technical", name: "Technical", max: 40 },
    { key: "footwork", name: "Footwork", max: 25 },
    { key: "tactical", name: "Game / Tactical", max: 20 },
    { key: "physical", name: "Physical / Attitude", max: 15 },
  ];
  let skillsBreakdown: { name: string; pct: number }[] = [];
  if (yearTotals.length) {
    skillsBreakdown = SECTIONS.map((sec) => {
      const pcts = (examsYear ?? []).map((e: any) => (Number(e[sec.key]) / sec.max) * 100);
      const avg = pcts.length ? pcts.reduce((x: number, y: number) => x + y, 0) / pcts.length : 0;
      return { name: sec.name, pct: Math.round(avg) };
    });
  }

  // ── Coach performance ─────────────────────────────────────────────────────
  const classIdsFor = (coachId: string) => {
    const set = new Set<string>();
    for (const c of classesFull ?? []) if (c.coach_id === coachId) set.add(c.id);
    for (const cc of classCoaches ?? []) if (cc.coach_id === coachId) set.add(cc.class_id);
    return set;
  };
  const enrollCountByClass = new Map<string, number>();
  for (const e of activeEnrollments ?? []) enrollCountByClass.set(e.class_id, (enrollCountByClass.get(e.class_id) ?? 0) + 1);
  const skillByCoach = new Map<string, number[]>();
  for (const e of examsYear ?? []) {
    if (!e.coach_id || e.total == null) continue;
    const arr = skillByCoach.get(e.coach_id) ?? [];
    arr.push(Number(e.total));
    skillByCoach.set(e.coach_id, arr);
  }
  const coachPerformance = (coachRows ?? []).map((co: any) => {
    const ids = classIdsFor(co.id);
    let students = 0;
    for (const cid of ids) students += enrollCountByClass.get(cid) ?? 0;
    let att = 0, total = 0;
    for (const cid of ids) { const t = coachAtt.get(cid); if (t) { att += t.att; total += t.total; } }
    const sk = skillByCoach.get(co.id) ?? [];
    return {
      id: co.id,
      name: co.full_name ?? "Coach",
      students,
      attendancePct: total ? Math.round((att / total) * 100) : null,
      avgSkill: sk.length ? round1(sk.reduce((x, y) => x + y, 0) / sk.length) : null,
    };
  });

  // ── Level distribution (active students, by training level 1–6) ───────────
  const classNameById = new Map<string, string>();
  for (const e of (activeEnrollments ?? []) as any[]) {
    if (e.class_id && e.classes?.name) classNameById.set(e.class_id, e.classes.name);
  }
  const rankDistribution: Record<string, number> = Object.fromEntries(LEVEL_NAMES.map((n) => [n, 0]));
  for (const s of (activeStudents ?? []) as any[]) {
    const name = levelName(Number(s.level ?? 1));
    rankDistribution[name] = (rankDistribution[name] ?? 0) + 1;
  }

  // ── Class occupancy (% of capacity) ───────────────────────────────────────
  const classOccupancy = (classesFull ?? [])
    .filter((c: any) => Number(c.capacity) > 0)
    .map((c: any) => {
      const enrolled = enrollCountByClass.get(c.id) ?? 0;
      const capacity = Number(c.capacity);
      return { id: c.id, name: c.name, enrolled, capacity, pct: Math.round((enrolled / capacity) * 100) };
    })
    .sort((a: any, b: any) => b.pct - a.pct);
  const avgOccupancyPct = classOccupancy.length
    ? Math.round(classOccupancy.reduce((x: number, c: any) => x + c.pct, 0) / classOccupancy.length)
    : null;

  // ── Students per class (headcount) ────────────────────────────────────────
  const studentsPerClass = [...enrollCountByClass.entries()]
    .map(([cid, count]) => ({ name: classNameById.get(cid) ?? "Class", count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // ── Rewards (this month) ──────────────────────────────────────────────────
  const pointsByStudent = new Map<string, { name: string; points: number }>();
  for (const r of ledger ?? []) {
    const sid = (r as any).student_id;
    if (!sid) continue;
    const name = (r as any).students?.full_name ?? "—";
    const e = pointsByStudent.get(sid) ?? { name, points: 0 };
    e.points += Number(r.points);
    pointsByStudent.set(sid, e);
  }
  const topStudents = [...pointsByStudent.entries()].map(([id, v]) => ({ id, name: v.name, points: v.points })).sort((a, b) => b.points - a.points).slice(0, 5);

  // ── Messages, collection, trends, churn ───────────────────────────────────
  const messageStatus: Record<string, number> = {};
  for (const m of messages ?? []) messageStatus[m.status] = (messageStatus[m.status] ?? 0) + 1;

  let billed = 0, collected = 0;
  for (const i of (invoices ?? []) as any[]) {
    if (!i.period_month || !String(i.period_month).startsWith(monthKey)) continue;
    if (i.status === "canceled" || i.status === "refunded") continue;
    billed += Number(i.amount);
    if (i.status === "paid") collected += Number(i.amount);
  }
  const collection = { billed: Math.round(billed), collected: Math.round(collected), rate: billed ? Math.round((collected / billed) * 100) : null };

  // Court rental cost (an operating expense) → net of what was collected.
  const courtRentalCost = Math.round((rentalRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0));
  const netRevenue = Math.round(collection.collected - courtRentalCost);

  // Trial-lead funnel (leads created this month, by ladder status).
  const funnel = { new: 0, contacted: 0, trial_booked: 0, trialed: 0, enrolled: 0, lost: 0 };
  for (const l of leadRows ?? []) {
    const st = (l as any).status as string;
    if (st in funnel) (funnel as any)[st]++;
  }
  const funnelTotal = funnel.new + funnel.contacted + funnel.trial_booked + funnel.trialed + funnel.enrolled + funnel.lost;
  const trialFunnel = { ...funnel, total: funnelTotal, convRate: funnelTotal ? Math.round((funnel.enrolled / funnelTotal) * 100) : null };

  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - 5 + i, 1);
    return { key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("en-MY", { month: "short" }), amount: 0, count: 0 };
  });
  const idx = new Map(months.map((m, i) => [m.key, i]));
  for (const p of trendPayments ?? []) {
    const d = new Date(p.created_at);
    const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i != null) months[i].amount += Number(p.amount);
  }
  let newStudentsThisMonth = 0;
  let inactiveStudents = 0;
  for (const s of (allStudents ?? []) as any[]) {
    if (s.status === "inactive") inactiveStudents++;
    const d = new Date(s.created_at);
    if (d >= mStart && d < mEnd) newStudentsThisMonth++;
    const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`);
    if (i != null) months[i].count++;
  }
  const revenueTrend = months.map((m) => ({ label: m.label, amount: Math.round(m.amount) }));
  const newStudentTrend = months.map((m) => ({ label: m.label, count: m.count }));

  return {
    monthLabel: monthLabel(monthStartISO),
    currency: env.paymentCurrency,
    counts: { students: activeCount, coaches: coaches.count ?? 0, parents: parents.count ?? 0, classes: (classesFull ?? []).length },
    revenueThisMonth,
    outstanding,
    attendanceRate,
    attendanceBreakdown,
    avgScore,
    assessmentCount: yearTotals.length,
    skillImprovement,
    skillsBreakdown,
    invoiceStatus,
    messageStatus,
    topStudents,
    rewardPeriod: monthLabel(monthStartISO),
    newStudentsThisMonth,
    inactiveStudents,
    revenueTrend,
    newStudentTrend,
    studentsPerClass,
    rankDistribution,
    collection,
    courtRentalCost,
    netRevenue,
    retention,
    coachPerformance,
    classOccupancy,
    avgOccupancyPct,
    feeAging,
    trialFunnel,
  };
}
