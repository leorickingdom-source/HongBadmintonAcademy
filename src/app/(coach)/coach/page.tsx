import Link from "next/link";
import { UserCheck, Calendar, Star, Banknote } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Section, EmptyState, Badge, ICON_TINT, cn } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import { coachClassIds } from "./_data";

export const dynamic = "force-dynamic";

const COACH_ACTIONS = [
  { href: "/coach/checkin", Icon: UserCheck, title: "Check-in & mark", sub: "Tap cards or mark by hand", tone: "green" },
  { href: "/coach/schedule", Icon: Calendar, title: "Schedule", sub: "Your sessions this month", tone: "blue" },
  { href: "/coach/marking", Icon: Star, title: "Marking", sub: "Score students this month", tone: "amber" },
  { href: "/coach/payroll", Icon: Banknote, title: "My Payroll", sub: "Lessons & pay this month", tone: "teal" },
];

export default async function CoachDashboard() {
  const me = await requireRole("coach");
  const supabase = await createClient();
  const classIds = await coachClassIds(supabase, me.id);
  const today = new Date().toLocaleDateString("en-CA");

  let sessions: any[] = [];
  let studentCount = 0;
  let todayCount = 0;
  if (classIds.length) {
    const [{ data: s }, { count }, { count: tCount }] = await Promise.all([
      supabase
        .from("sessions")
        .select("id, session_date, start_time, end_time, location, status, classes(name)")
        .in("class_id", classIds)
        .gte("session_date", today)
        .order("session_date")
        .order("start_time")
        .limit(3),
      supabase
        .from("enrollments")
        .select("*", { count: "exact", head: true })
        .in("class_id", classIds)
        .eq("active", true),
      supabase
        .from("sessions")
        .select("*", { count: "exact", head: true })
        .in("class_id", classIds)
        .eq("session_date", today),
    ]);
    sessions = s ?? [];
    studentCount = count ?? 0;
    todayCount = tCount ?? 0;
  }

  // ─── Coach performance (this month) ──────────────────────────────────────
  let lessonsThis = 0;
  let lessonsLast = 0;
  let attPct: number | null = null;
  let avgGiven: number | null = null;
  if (classIds.length) {
    const myt = new Date(Date.now() + 8 * 3600 * 1000);
    const yy = myt.getUTCFullYear();
    const mm = myt.getUTCMonth();
    const mStart = `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
    const mEnd = new Date(Date.UTC(yy, mm + 1, 0)).toISOString().slice(0, 10);
    const lmStart = new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
    const lmEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);

    const [{ data: thisSess }, { count: lastCount }, { data: assess }] = await Promise.all([
      supabase.from("sessions").select("id").in("class_id", classIds).gte("session_date", mStart).lte("session_date", mEnd),
      supabase.from("sessions").select("*", { count: "exact", head: true }).in("class_id", classIds).gte("session_date", lmStart).lte("session_date", lmEnd),
      supabase.from("assessments").select("overall_score").eq("coach_id", me.id).limit(10000),
    ]);
    lessonsThis = (thisSess ?? []).length;
    lessonsLast = lastCount ?? 0;

    const sIds = (thisSess ?? []).map((x: any) => x.id);
    if (sIds.length) {
      const { data: att } = await supabase.from("attendance").select("status").in("session_id", sIds);
      const tot = (att ?? []).length;
      const came = (att ?? []).filter((a: any) => a.status === "present" || a.status === "late").length;
      attPct = tot ? Math.round((came / tot) * 100) : null;
    }
    const scores = (assess ?? []).map((a: any) => Number(a.overall_score)).filter((n: number) => !Number.isNaN(n));
    avgGiven = scores.length ? Math.round((scores.reduce((x: number, y: number) => x + y, 0) / scores.length) * 10) / 10 : null;
  }

  return (
    <div>
      <PageHeader
        title={`Welcome, ${me.full_name ?? "Coach"}`}
        description="Your classes and today's sessions."
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {COACH_ACTIONS.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-green-300 hover:shadow-sm"
          >
            <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-lg", ICON_TINT[q.tone])}>
              <q.Icon className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <div className="font-semibold leading-tight text-slate-900">{q.title}</div>
              <div className="truncate text-xs text-slate-500">{q.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Your classes" value={classIds.length} />
        <StatCard label="Students" value={studentCount} tone="green" />
        <StatCard label="Sessions today" value={todayCount} tone={todayCount ? "blue" : "slate"} />
      </div>

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">My performance</h2>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Lessons this month" value={lessonsThis} sub={`${lessonsLast} last month`} tone="blue" />
        <StatCard label="Attendance" value={attPct != null ? `${attPct}%` : "—"} tone={attPct != null && attPct >= 70 ? "green" : "amber"} sub="your classes, this month" />
        <StatCard label="Avg score given" value={avgGiven != null ? `${avgGiven}%` : "—"} sub="your assessments" />
      </div>

      <div className="mt-8">
        <Section title="Upcoming sessions" flush>
          {sessions.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <div className="font-medium text-slate-900">{s.classes?.name ?? "Class"}</div>
                    <div className="text-sm text-slate-500">
                      {formatDate(s.session_date)} · {formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.location ?? "—"}
                    </div>
                  </div>
                  <Badge tone={s.status === "completed" ? "green" : "blue"}>{s.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5"><EmptyState message="No upcoming sessions scheduled." /></div>
          )}
        </Section>
      </div>
    </div>
  );
}
