import Link from "next/link";
import { Clock, MessageCircle } from "lucide-react";
import { requireParent } from "@/lib/parent-auth";
import { env } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PageHeader, Card, EmptyState, Badge, Avatar, cn,
} from "@/components/ui";
import { formatCurrency, formatTime } from "@/lib/format";
import { type SessionItem } from "@/components/parent-session-list";
import { RANK_ORDER } from "@/lib/ranks";
import { levelBadgeClass } from "@/lib/training";
import type { FeeInterval } from "@/lib/types";
import { dict } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export default async function ParentDashboard() {
  const me = await requireParent();
  const L = dict(me.locale);
  const supabase = createAdminClient();

  const { data: children } = await supabase
    .from("students")
    .select("id, full_name, status, photo_url, level")
    .eq("parent_id", me.id)
    .order("full_name");

  const childIds = (children ?? []).map((c) => c.id);

  const myt = new Date(Date.now() + 8 * 3600 * 1000);
  const monthStartISO = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), 1)).toISOString();

  // Class + fees + latest monthly coach marks + this-month promotions, per child.
  const [{ data: enrollments }, { data: invoices }, { count: unpaid }, { data: monthlyRows }, { data: rankEvents }, { data: attRows }] =
    await Promise.all([
      childIds.length
        ? supabase
            .from("enrollments")
            .select("student_id, class_id, classes(name)")
            .in("student_id", childIds)
            .eq("active", true)
        : Promise.resolve({ data: [] as any[] }),
      childIds.length
        ? supabase
            .from("invoices")
            .select("student_id, amount, currency, status, due_date, created_at, fee_plans(name, amount, currency, interval)")
            .in("student_id", childIds)
            .order("created_at", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      supabase
        .from("invoices")
        .select("*", { count: "exact", head: true })
        .eq("parent_id", me.id)
        .in("status", ["unpaid", "overdue"]),
      childIds.length
        ? supabase
            .from("monthly_assessments")
            .select("student_id, period_month, fitness, skills, attitude")
            .in("student_id", childIds)
            .order("period_month", { ascending: false })
        : Promise.resolve({ data: [] as any[] }),
      childIds.length
        ? supabase
            .from("rank_events")
            .select("student_id, from_rank, to_rank, created_at")
            .in("student_id", childIds)
            .gte("created_at", monthStartISO)
        : Promise.resolve({ data: [] as any[] }),
      childIds.length
        ? supabase
            .from("attendance")
            .select("student_id, status, created_at")
            .in("student_id", childIds)
            .order("created_at", { ascending: false })
            .limit(400)
        : Promise.resolve({ data: [] as any[] }),
    ]);

  const classByChild = new Map<string, string>();
  const classIds: string[] = [];
  for (const e of (enrollments ?? []) as any[]) {
    if (e.classes && !classByChild.has(e.student_id)) {
      classByChild.set(e.student_id, e.classes.name);
    }
    if (e.class_id && !classIds.includes(e.class_id)) classIds.push(e.class_id);
  }

  // classes, co-coaches and upcoming sessions all key off classIds — fetch them
  // in one round, then resolve coach names (the only dependent follow-up).
  const today = new Date().toLocaleDateString("en-CA");
  const classCoach = new Map<string, string>();
  let upcomingSessions: any[] = [];
  if (classIds.length) {
    const [{ data: cls }, { data: ccs }, { data: sess }] = await Promise.all([
      supabase.from("classes").select("id, coach_id").in("id", classIds),
      supabase.from("class_coaches").select("class_id, coach_id").in("class_id", classIds),
      supabase
        .from("sessions")
        .select("id, session_date, start_time, end_time, location, status, class_id")
        .in("class_id", classIds)
        .gte("session_date", today)
        .order("session_date")
        .order("start_time")
        .limit(3),
    ]);
    upcomingSessions = sess ?? [];
    const ids = new Set<string>();
    for (const c of (cls ?? []) as any[]) if (c.coach_id) ids.add(c.coach_id);
    for (const c of (ccs ?? []) as any[]) if (c.coach_id) ids.add(c.coach_id);
    const { data: cp } = ids.size
      ? await supabase.from("profiles").select("id, full_name").in("id", [...ids])
      : { data: [] as any[] };
    const nameById = new Map((cp ?? []).map((p: any) => [p.id, p.full_name as string]));
    for (const c of (cls ?? []) as any[]) if (c.coach_id) classCoach.set(c.id, nameById.get(c.coach_id) ?? "");
    for (const c of (ccs ?? []) as any[]) if (!classCoach.has(c.class_id) && c.coach_id) classCoach.set(c.class_id, nameById.get(c.coach_id) ?? "");
  }

  // class_id → child name(s)
  const classToChild = new Map<string, string[]>();
  for (const e of (enrollments ?? []) as any[]) {
    if (!e.class_id) continue;
    const child = (children ?? []).find((c) => c.id === e.student_id);
    if (!child) continue;
    const cur = classToChild.get(e.class_id) ?? [];
    cur.push(child.full_name);
    classToChild.set(e.class_id, cur);
  }

  // class_id → class name
  const classNameMap = new Map<string, string>();
  for (const e of (enrollments ?? []) as any[]) {
    if (e.class_id && e.classes?.name) classNameMap.set(e.class_id, e.classes.name);
  }

  type Fees = {
    plan: { name: string; amount: number; currency: string; interval: FeeInterval } | null;
    outstanding: number;
    currency: string;
    unpaidCount: number;
  };
  const feesByChild = new Map<string, Fees>();
  for (const inv of (invoices ?? []) as any[]) {
    const cur = feesByChild.get(inv.student_id) ?? {
      plan: null, outstanding: 0, currency: inv.currency ?? "MYR", unpaidCount: 0,
    };
    if (!cur.plan && inv.fee_plans) cur.plan = inv.fee_plans;
    if (inv.status === "unpaid" || inv.status === "overdue") {
      cur.outstanding += Number(inv.amount);
      cur.unpaidCount += 1;
    }
    feesByChild.set(inv.student_id, cur);
  }

  const totalOutstanding = [...feesByChild.values()].reduce((s, f) => s + f.outstanding, 0);
  const outCurrency = [...feesByChild.values()][0]?.currency ?? "MYR";
  // Past due = unpaid/overdue with a due_date before today (invoices never auto-
  // flip to status "overdue", so detect it from the date).
  const overdueCount = (invoices ?? []).filter(
    (i: any) => (i.status === "unpaid" || i.status === "overdue") && i.due_date && i.due_date < today,
  ).length;

  // Latest monthly coach marks per child (rows newest-first) → average of the
  // three 1-5 dimensions. Skip a month with no marks so we fall back to the most
  // recent month that actually has scores. + who was promoted this month.
  const monthlyByChild = new Map<string, { avg: number }>();
  for (const m of (monthlyRows ?? []) as any[]) {
    if (monthlyByChild.has(m.student_id)) continue;
    const dims = [m.fitness, m.skills, m.attitude].map(Number).filter((n) => n > 0);
    if (!dims.length) continue;
    monthlyByChild.set(m.student_id, { avg: dims.reduce((a, b) => a + b, 0) / dims.length });
  }
  const promoted = new Set<string>();
  for (const ev of (rankEvents ?? []) as any[]) {
    if ((RANK_ORDER[ev.to_rank] ?? 0) > (RANK_ORDER[ev.from_rank] ?? 0)) promoted.add(ev.student_id);
  }

  // Current attendance streak per child — consecutive present/late from the most
  // recent marked session. An excused (approved-leave) session is skipped, not a
  // break, so a sanctioned absence doesn't zero a good run.
  const streakByChild = new Map<string, number>();
  const streakBroken = new Set<string>();
  for (const a of (attRows ?? []) as any[]) {
    if (streakBroken.has(a.student_id)) continue;
    if (a.status === "present" || a.status === "late") {
      streakByChild.set(a.student_id, (streakByChild.get(a.student_id) ?? 0) + 1);
    } else if (a.status === "absent") {
      streakBroken.add(a.student_id);
    }
  }

  const homeSessions: SessionItem[] = (upcomingSessions ?? []).map((s: any) => {
    const d = new Date(`${s.session_date}T00:00:00`);
    return {
      id: s.id,
      kind: "upcoming",
      mon: d.toLocaleDateString("en-MY", { month: "short" }),
      day: d.getDate(),
      wd: d.toLocaleDateString("en-MY", { weekday: "short" }),
      timeLabel: `${formatTime(s.start_time)}–${formatTime(s.end_time)}`,
      fullDate: d.toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long" }),
      location: s.location,
      className: classNameMap.get(s.class_id) ?? "—",
      coach: classCoach.get(s.class_id) || null,
      status: s.status ?? "scheduled",
      who: classToChild.get(s.class_id) ?? [],
      kids: [],
    };
  });

  const todaysSessions = (upcomingSessions ?? []).filter((s: any) => s.session_date === today);

  return (
    <div>
      <PageHeader title={`${L.hello}, ${me.full_name ?? "Parent"}`} />

      {/* ─── Your children — growth first ────────────────────────────────── */}
      {children && children.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {children.map((c) => {
            const clsName = classByChild.get(c.id);
            const lvl = Number((c as any).level ?? 1);
            const ms = monthlyByChild.get(c.id);
            const streak = streakByChild.get(c.id) ?? 0;
            return (
              <Link key={c.id} href={`/parent/children/${c.id}`} className="group">
                <Card className="h-full p-4 transition-all hover:border-emerald-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.full_name} src={(c as any).photo_url} size={40} />
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-base font-semibold text-slate-900 group-hover:text-emerald-700">{c.full_name}</span>
                          <span className={cn("inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold", levelBadgeClass(lvl))}>L{lvl}</span>
                        </div>
                        <div className="mt-0.5 text-sm text-slate-500">{clsName ?? L.not_enrolled}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {streak >= 2 && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-700">🔥 {streak}</span>
                      )}
                      {c.status !== "active" && <Badge tone="slate">{c.status}</Badge>}
                      {promoted.has(c.id) && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          ↑ {L.promoted}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                    {ms ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-emerald-700">{ms.avg.toFixed(1)}</span>
                        <span className="text-xs font-medium text-slate-400">{L.monthly_score_suffix}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">{L.no_marks_yet}</span>
                    )}
                    <span className="text-sm font-medium text-emerald-700">{L.progress_arrow}</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState message={L.no_children} />
      )}

      {/* ─── Join the parent WhatsApp community (one tap, opt-in) ─────────── */}
      {env.waCommunityLink && (
        <a
          href={env.waCommunityLink}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 transition-colors hover:bg-emerald-100"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <div className="text-base font-semibold text-emerald-900">{L.join_community}</div>
              <div className="mt-0.5 text-xs text-emerald-700">{L.join_community_sub}</div>
            </div>
          </div>
          <span className="shrink-0 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white">{L.join}</span>
        </a>
      )}

      {/* ─── Today's schedule (else the next upcoming session) ───────────── */}
      {todaysSessions.length > 0 ? (
        <div className="mt-6">
          <h2 className="mb-2 text-lg font-semibold text-slate-900">{L.todays_schedule}</h2>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            {todaysSessions.map((s: any) => (
              <Link
                key={s.id}
                href="/parent/schedule"
                className="flex items-center gap-3 border-t border-slate-100 px-4 py-3 transition-colors first:border-t-0 hover:bg-slate-50"
              >
                <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-emerald-50">
                  <Clock className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="mt-0.5 text-[11px] font-bold leading-none text-emerald-800">{formatTime(s.start_time)}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-slate-900">{classNameMap.get(s.class_id) ?? "Class"}</div>
                  <div className="truncate text-xs text-slate-500">
                    {formatTime(s.start_time)}–{formatTime(s.end_time)}{s.location ? ` · ${s.location}` : ""}
                  </div>
                </div>
                {s.status && s.status !== "scheduled" && (
                  <Badge tone={s.status === "completed" ? "green" : s.status === "canceled" ? "red" : "blue"}>{s.status}</Badge>
                )}
              </Link>
            ))}
          </div>
        </div>
      ) : homeSessions.length > 0 ? (
        <Link
          href="/parent/schedule"
          className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 transition-colors hover:bg-slate-50"
        >
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-lg bg-emerald-50">
              <span className="text-[10px] font-semibold uppercase text-emerald-600">{homeSessions[0].mon}</span>
              <span className="text-base font-bold leading-none text-emerald-800">{homeSessions[0].day}</span>
            </div>
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-slate-900">{L.next_session}: {homeSessions[0].className}</div>
              <div className="truncate text-xs text-slate-500">
                {homeSessions[0].wd} {homeSessions[0].timeLabel}{homeSessions[0].location ? ` · ${homeSessions[0].location}` : ""}
              </div>
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-emerald-700">{L.schedule_arrow}</span>
        </Link>
      ) : null}

      {/* ─── Fees — kept calm and last ───────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">{L.fees}</h2>
        {unpaid && unpaid > 0 ? (
          <Link
            href="/parent/invoices"
            className={cn(
              "flex items-center justify-between gap-3 rounded-xl border p-4 transition-colors",
              overdueCount > 0 ? "border-red-200 bg-red-50 hover:bg-red-100/70" : "border-slate-200 bg-slate-50 hover:bg-slate-100",
            )}
          >
            <div className="min-w-0">
              <div className={cn("text-base font-semibold", overdueCount > 0 ? "text-red-700" : "text-slate-900")}>
                {formatCurrency(totalOutstanding, outCurrency)} {L.outstanding_suffix}
              </div>
              <div className={cn("mt-0.5 text-xs", overdueCount > 0 ? "font-medium text-red-600" : "text-slate-500")}>
                {overdueCount > 0
                  ? `${overdueCount} ${L.overdue_settle}`
                  : `${unpaid} invoice${unpaid > 1 ? "s" : ""} ${L.invoice_whenever}`}
              </div>
            </div>
            <span
              className={cn(
                "inline-flex shrink-0 items-center gap-1 rounded-lg border px-4 py-2 text-sm font-semibold transition-colors",
                overdueCount > 0
                  ? "border-red-600 bg-red-600 text-white hover:bg-red-700"
                  : "border-emerald-600 text-emerald-700 hover:bg-emerald-50",
              )}
            >
              {overdueCount > 0 ? L.pay_now : L.view_and_pay}
            </span>
          </Link>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-600">
            {L.all_paid_up}
          </div>
        )}
      </div>
    </div>
  );
}
