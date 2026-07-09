import Link from "next/link";
import { Clock, MapPin, UserCheck } from "lucide-react";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, StatCard, Section, EmptyState, Badge } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { BranchChip } from "@/components/branch-chip";
import { listBranches } from "@/lib/branch";
import { formatDate, formatTime } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { isEligibleCover } from "@/lib/cover";
import { coachClassIds, coachCoverSessionIds } from "./_data";
import { makeCoverOffer, withdrawCoverOffer, acceptAssignedCover, declineAssignedCover } from "./cover-actions";

export const dynamic = "force-dynamic";

export default async function CoachDashboard() {
  const me = await requireRole("coach");
  const L = dict(me.locale);
  const supabase = await createClient();
  const [classIds, coverIds] = await Promise.all([
    coachClassIds(supabase, me.id),
    coachCoverSessionIds(supabase, me.id),
  ]);
  const coverSet = new Set(coverIds);
  const myBranch = me.branch_id ? (await listBranches(false)).find((b) => b.id === me.branch_id) ?? null : null;
  // Malaysia time (server runs UTC on Vercel) so "today" doesn't roll over early
  // and point the check-in CTA at the wrong day after ~4pm MYT.
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);

  let sessions: any[] = [];
  const upcomingQueries: Promise<{ data: any[] | null }>[] = [];
  if (classIds.length) {
    upcomingQueries.push(
      supabase
        .from("sessions")
        .select("id, class_id, session_date, start_time, end_time, location, status, classes(name)")
        .in("class_id", classIds)
        .gte("session_date", today)
        .order("session_date")
        .order("start_time")
        .limit(5) as any,
    );
  }
  if (coverIds.length) {
    upcomingQueries.push(
      supabase
        .from("sessions")
        .select("id, class_id, session_date, start_time, end_time, location, status, classes(name)")
        .in("id", coverIds)
        .gte("session_date", today)
        .order("session_date")
        .order("start_time")
        .limit(5) as any,
    );
  }
  if (upcomingQueries.length) {
    const results = await Promise.all(upcomingQueries);
    const merged = results.flatMap((r) => r.data ?? []);
    const dedup = new Map<string, any>();
    for (const s of merged) if (!dedup.has(s.id)) dedup.set(s.id, s);
    sessions = [...dedup.values()].sort((a, b) => (a.session_date + a.start_time).localeCompare(b.session_date + b.start_time)).slice(0, 5);
    for (const s of sessions) s.__cover = coverSet.has(s.id);
  }

  // Open cover requests this coach can pick up (broadcast by an admin). RLS
  // (coach_leave_open_read) lets a coach read the open leave ROWS, but NOT the
  // joined session — a coach can't read a session they don't coach, so the embed
  // comes back null. So we read the leave rows via RLS, then hydrate session +
  // on-leave-coach names via the service-role client (not sensitive).
  const admin = createAdminClient();
  const [{ data: openLeaves }, { data: myOffers }, { data: assignedPending }] = await Promise.all([
    supabase.from("coach_leave_requests").select("id, coach_id, session_id").eq("cover_status", "open"),
    supabase.from("coach_cover_offers").select("leave_id").eq("coach_id", me.id).eq("status", "offered"),
    // Covers an admin assigned directly to me, awaiting my Accept/Decline. Here
    // coach_of_replacement() lets me read the session, so the embed works.
    supabase
      .from("coach_leave_requests")
      .select("id, coach:profiles!coach_leave_requests_coach_id_fkey(full_name), sessions(session_date, start_time, end_time, classes(name))")
      .eq("replacement_coach_id", me.id)
      .eq("cover_status", "filled")
      .is("replacement_accepted", null),
  ]);
  const assigned = (assignedPending ?? []) as any[];
  const offeredSet = new Set(((myOffers ?? []) as any[]).map((o) => o.leave_id));

  const openList = ((openLeaves ?? []) as any[]).filter((l) => l.coach_id !== me.id);
  const sessIds = [...new Set(openList.map((l) => l.session_id))];
  const leaveCoachIds = [...new Set(openList.map((l) => l.coach_id))];
  const [sDetail, cNames] = sessIds.length
    ? await Promise.all([
        admin.from("sessions").select("id, session_date, start_time, end_time, branch_id, classes(name)").in("id", sessIds),
        admin.from("profiles").select("id, full_name").in("id", leaveCoachIds),
      ])
    : [{ data: [] as any[] }, { data: [] as any[] }];
  const sById = new Map(((sDetail.data ?? []) as any[]).map((x) => [x.id, x]));
  const cById = new Map(((cNames.data ?? []) as any[]).map((x) => [x.id, x.full_name]));

  const coverRequests: any[] = [];
  for (const l of openList) {
    const s = sById.get(l.session_id);
    if (!s) continue;
    const already = offeredSet.has(l.id);
    const ok =
      already ||
      (await isEligibleCover(
        {
          sessionId: l.session_id,
          sessionDate: s.session_date,
          startTime: s.start_time,
          endTime: s.end_time,
          branchId: s.branch_id ?? null,
          onLeaveCoachId: l.coach_id,
        },
        me.id,
      ));
    if (ok) {
      coverRequests.push({
        id: l.id,
        offered: already,
        sessions: { session_date: s.session_date, start_time: s.start_time, end_time: s.end_time, classes: { name: s.classes?.name ?? null } },
        coach: { full_name: cById.get(l.coach_id) ?? null },
      });
    }
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
  if (classIds.length) {
    const myt = new Date(Date.now() + 8 * 3600 * 1000);
    const yy = myt.getUTCFullYear();
    const mm = myt.getUTCMonth();
    const mStart = `${yy}-${String(mm + 1).padStart(2, "0")}-01`;
    const mEnd = new Date(Date.UTC(yy, mm + 1, 0)).toISOString().slice(0, 10);
    const lmStart = new Date(Date.UTC(yy, mm - 1, 1)).toISOString().slice(0, 10);
    const lmEnd = new Date(Date.UTC(yy, mm, 0)).toISOString().slice(0, 10);

    const [{ data: thisSess }, { count: lastCount }] = await Promise.all([
      supabase.from("sessions").select("id").in("class_id", classIds).gte("session_date", mStart).lte("session_date", mEnd),
      supabase.from("sessions").select("*", { count: "exact", head: true }).in("class_id", classIds).gte("session_date", lmStart).lte("session_date", lmEnd),
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
  }

  return (
    <div>
      <PageHeader
        title={`${L.coach_welcome}, ${me.full_name ?? "Coach"}`}
        description={
          <span className="inline-flex flex-wrap items-center gap-2">
            {L.coach_dash_desc}
            {myBranch && <BranchChip name={myBranch.name} color={myBranch.color} />}
          </span>
        }
      />

      {current ? (
        <Link
          href="/coach/checkin"
          className="flex items-center justify-between gap-3 rounded-xl border border-green-200 bg-green-50 p-4 transition-colors hover:bg-green-100/70"
        >
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-700">
              {inProgress ? L.coach_in_progress : L.coach_next_today}
            </div>
            <div className="text-lg font-bold text-slate-900">
              {current.classes?.name ?? "Class"}
              {current.__cover && (
                <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">{L.cover_badge}</span>
              )}
            </div>
            <div className="text-sm text-slate-600">
              {formatTime(current.start_time)}–{formatTime(current.end_time)}{current.location ? ` · ${current.location}` : ""}
            </div>
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-4 py-2.5 text-sm font-semibold text-white">
            <UserCheck className="h-4 w-4" /> {L.start_checkin} →
          </span>
        </Link>
      ) : todaySessions.length > 0 ? (
        <Link href="/coach/checkin" className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 text-sm hover:bg-slate-50">
          <span className="text-slate-600">{L.today_done}</span>
          <span className="font-medium text-green-700">{L.open_checkin} →</span>
        </Link>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-500">{L.no_class_today}</div>
      )}

      {assigned.length > 0 && (
        <div className="mt-6">
          <Section title={`${L.cover_assigned} (${assigned.length})`} flush>
            <ul className="divide-y divide-slate-100">
              {assigned.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{l.sessions?.classes?.name ?? "Class"}</div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {formatDate(l.sessions?.session_date)} · {formatTime(l.sessions?.start_time)}–{formatTime(l.sessions?.end_time)}
                      {" · "}{L.cover_for}{l.coach?.full_name ?? L.adm_coach}
                    </div>
                  </div>
                  <form action={acceptAssignedCover}>
                    <input type="hidden" name="leave_id" value={l.id} />
                    <SubmitButton pendingText="…">{L.cover_accept}</SubmitButton>
                  </form>
                  <form action={declineAssignedCover}>
                    <input type="hidden" name="leave_id" value={l.id} />
                    <SubmitButton variant="ghost" pendingText="…">{L.cover_decline}</SubmitButton>
                  </form>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      {coverRequests.length > 0 && (
        <div className="mt-6">
          <Section title={`${L.cover_requests} (${coverRequests.length})`} flush>
            <ul className="divide-y divide-slate-100">
              {coverRequests.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{l.sessions?.classes?.name ?? "Class"}</div>
                    <div className="mt-0.5 text-sm text-slate-500">
                      {formatDate(l.sessions?.session_date)} · {formatTime(l.sessions?.start_time)}–{formatTime(l.sessions?.end_time)}
                      {" · "}{L.cover_for}{l.coach?.full_name ?? L.adm_coach}
                    </div>
                  </div>
                  {l.offered ? (
                    <form action={withdrawCoverOffer} className="flex items-center gap-2">
                      <input type="hidden" name="leave_id" value={l.id} />
                      <span className="text-xs font-semibold text-emerald-700">{L.cover_offered}</span>
                      <SubmitButton variant="ghost" pendingText="…">{L.cover_withdraw}</SubmitButton>
                    </form>
                  ) : (
                    <form action={makeCoverOffer}>
                      <input type="hidden" name="leave_id" value={l.id} />
                      <SubmitButton pendingText="…">{L.cover_ill_cover}</SubmitButton>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}

      <h2 className="mb-3 mt-8 text-lg font-semibold text-slate-900">{L.my_performance}</h2>
      <div className="grid grid-cols-2 gap-4">
        <Link href="/coach/schedule" className="rounded-2xl transition-transform hover:-translate-y-0.5">
          <StatCard label={L.lessons_this_month} value={lessonsThis} sub={`${lessonsLast} ${L.coach_last_month} · ${L.view_schedule} →`} tone="blue" />
        </Link>
        <StatCard label={L.attendance} value={attPct != null ? `${attPct}%` : "—"} tone={attPct != null && attPct >= 70 ? "green" : "amber"} sub={L.your_classes_month} />
      </div>

      <div className="mt-8">
        <Section
          title={L.upcoming_sessions}
          flush
          action={
            <Link href="/coach/schedule" className="text-sm font-medium text-emerald-700 hover:underline">
              {L.view_all} →
            </Link>
          }
        >
          {sessions.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {sessions.slice(0, 3).map((s) => {
                const d = new Date(`${s.session_date}T00:00:00`);
                const mon = d.toLocaleDateString("en-MY", { month: "short" });
                const wd = d.toLocaleDateString("en-MY", { weekday: "short" });
                return (
                  <li key={s.id}>
                    <Link href={`/coach/classes/${s.class_id}`} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50">
                      <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-50">
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">{mon}</span>
                        <span className="text-xl font-bold leading-none text-emerald-800">{d.getDate()}</span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900">
                          {s.classes?.name ?? "Class"}
                          {s.__cover && (
                            <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800 ring-1 ring-inset ring-amber-200">{L.cover_badge}</span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{wd} {formatTime(s.start_time)}–{formatTime(s.end_time)}</span>
                          {s.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.location}</span>}
                        </div>
                      </div>
                      {s.status !== "scheduled" && (
                        <Badge tone={s.status === "completed" ? "green" : s.status === "canceled" ? "red" : "blue"}>{s.status}</Badge>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <div className="p-5"><EmptyState message={L.no_upcoming} /></div>
          )}
        </Section>
      </div>
    </div>
  );
}
