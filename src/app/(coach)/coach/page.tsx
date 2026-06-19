import Link from "next/link";
import { Clock, MapPin, UserCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Section, EmptyState, Badge } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { coachClassIds } from "./_data";

export const dynamic = "force-dynamic";

export default async function CoachDashboard() {
  const me = await requireRole("coach");
  const supabase = await createClient();
  const classIds = await coachClassIds(supabase, me.id);
  const today = new Date().toLocaleDateString("en-CA");

  let sessions: any[] = [];
  if (classIds.length) {
    const { data: s } = await supabase
      .from("sessions")
      .select("id, session_date, start_time, end_time, location, status, classes(name)")
      .in("class_id", classIds)
      .gte("session_date", today)
      .order("session_date")
      .order("start_time")
      .limit(5);
    sessions = s ?? [];
  }

  // Current class to check in: today's first session that hasn't ended yet
  // (in progress once it has also started). Drives the "Start check-in" CTA.
  const nowHM = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(11, 19);
  const todaySessions = sessions.filter((s) => s.session_date === today);
  const current = todaySessions.find((s) => (s.end_time ?? "") >= nowHM) ?? null;
  const inProgress = current ? (current.start_time ?? "") <= nowHM : false;

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

      {current ? (
        <Link
          href="/coach/checkin"
          className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4 transition-colors hover:bg-green-100/70"
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
              {inProgress ? "In progress" : "Next today"}
            </div>
            <div className="text-lg font-bold text-slate-900">{current.classes?.name ?? "Class"}</div>
            <div className="text-sm text-slate-600">
              {formatTime(current.start_time)}–{formatTime(current.end_time)}{current.location ? ` · ${current.location}` : ""}
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white">
            <UserCheck className="h-4 w-4" /> Start check-in →
          </span>
        </Link>
      ) : todaySessions.length > 0 ? (
        <Link href="/coach/checkin" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm hover:bg-slate-50">
          <span className="text-slate-600">Today's classes are done.</span>
          <span className="font-medium text-green-700">Open check-in →</span>
        </Link>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">No class scheduled today.</div>
      )}

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
              {sessions.map((s) => {
                const d = new Date(`${s.session_date}T00:00:00`);
                const mon = d.toLocaleDateString("en-MY", { month: "short" });
                const wd = d.toLocaleDateString("en-MY", { weekday: "short" });
                return (
                  <li key={s.id} className="flex items-center gap-3.5 px-4 py-3.5">
                    <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-50">
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">{mon}</span>
                      <span className="text-xl font-bold leading-none text-emerald-800">{d.getDate()}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">{s.classes?.name ?? "Class"}</div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{wd} {formatTime(s.start_time)}–{formatTime(s.end_time)}</span>
                        {s.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.location}</span>}
                      </div>
                    </div>
                    {s.status !== "scheduled" && (
                      <Badge tone={s.status === "completed" ? "green" : s.status === "canceled" ? "red" : "blue"}>{s.status}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-5"><EmptyState message="No upcoming sessions scheduled." /></div>
          )}
        </Section>
      </div>
    </div>
  );
}
