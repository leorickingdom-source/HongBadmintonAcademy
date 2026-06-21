import Link from "next/link";
import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PageHeader, Card, EmptyState, Badge, Avatar,
} from "@/components/ui";
import { formatCurrency, formatTime } from "@/lib/format";
import { type SessionItem } from "@/components/parent-session-list";
import { RANK_ORDER } from "@/lib/ranks";
import type { FeeInterval } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ParentDashboard() {
  const me = await requireParent();
  const supabase = createAdminClient();

  const { data: children } = await supabase
    .from("students")
    .select("id, full_name, status, photo_url")
    .eq("parent_id", me.id)
    .order("full_name");

  const childIds = (children ?? []).map((c) => c.id);

  const myt = new Date(Date.now() + 8 * 3600 * 1000);
  const monthStartISO = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), 1)).toISOString();

  // Class + fees + latest growth report + this-month promotions, per child.
  const [{ data: enrollments }, { data: invoices }, { count: unpaid }, { data: scorecardRows }, { data: rankEvents }] =
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
            .select("student_id, amount, currency, status, created_at, fee_plans(name, amount, currency, interval)")
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
            .from("scorecards")
            .select("student_id, period_month, summary")
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
    ]);

  const classByChild = new Map<string, string>();
  const classIds: string[] = [];
  for (const e of (enrollments ?? []) as any[]) {
    if (e.classes && !classByChild.has(e.student_id)) {
      classByChild.set(e.student_id, e.classes.name);
    }
    if (e.class_id && !classIds.includes(e.class_id)) classIds.push(e.class_id);
  }

  // class_id → coach name for the upcoming-session rows.
  const classCoach = new Map<string, string>();
  if (classIds.length) {
    const [{ data: cls }, { data: ccs }] = await Promise.all([
      supabase.from("classes").select("id, coach_id").in("id", classIds),
      supabase.from("class_coaches").select("class_id, coach_id").in("class_id", classIds),
    ]);
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

  const today = new Date().toLocaleDateString("en-CA");
  const { data: upcomingSessions } = classIds.length
    ? await supabase
        .from("sessions")
        .select("id, session_date, start_time, end_time, location, status, class_id")
        .in("class_id", classIds)
        .gte("session_date", today)
        .order("session_date")
        .order("start_time")
        .limit(3)
    : { data: [] as any[] };

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

  // Latest growth report per child (rows are newest-first) + who was promoted this month.
  const growthByChild = new Map<string, number | null>();
  for (const sc of (scorecardRows ?? []) as any[]) {
    if (growthByChild.has(sc.student_id)) continue;
    growthByChild.set(sc.student_id, sc.summary?.growth_index ?? null);
  }
  const promoted = new Set<string>();
  for (const ev of (rankEvents ?? []) as any[]) {
    if ((RANK_ORDER[ev.to_rank] ?? 0) > (RANK_ORDER[ev.from_rank] ?? 0)) promoted.add(ev.student_id);
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

  return (
    <div>
      <PageHeader title={`Hello, ${me.full_name ?? "Parent"}`} />

      {/* ─── Your children — growth first ────────────────────────────────── */}
      {children && children.length > 0 ? (
        <div className="grid gap-3 md:grid-cols-2">
          {children.map((c) => {
            const clsName = classByChild.get(c.id);
            const gi = growthByChild.get(c.id);
            const hasReport = growthByChild.has(c.id);
            return (
              <Link key={c.id} href={`/parent/children/${c.id}`} className="group">
                <Card className="h-full p-4 transition-all hover:border-emerald-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.full_name} src={(c as any).photo_url} size={40} />
                      <div>
                        <div className="text-base font-semibold text-slate-900 group-hover:text-emerald-700">
                          {c.full_name}
                        </div>
                        <div className="mt-0.5 text-sm text-slate-500">{clsName ?? "Not enrolled"}</div>
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      {c.status !== "active" && <Badge tone="slate">{c.status}</Badge>}
                      {promoted.has(c.id) && (
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                          ↑ Promoted
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2.5">
                    {hasReport ? (
                      <div className="flex items-baseline gap-1.5">
                        <span className="text-2xl font-bold text-emerald-700">{gi ?? "—"}</span>
                        <span className="text-xs font-medium text-slate-400">/100 growth index</span>
                      </div>
                    ) : (
                      <span className="text-xs text-slate-400">No growth report yet</span>
                    )}
                    <span className="text-sm font-medium text-emerald-700">Report →</span>
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState message="No children linked to your account yet. Contact the academy." />
      )}

      {/* ─── Next session — one slim line; full list is the Schedule tab ──── */}
      {homeSessions.length > 0 && (
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
              <div className="truncate text-sm font-semibold text-slate-900">Next: {homeSessions[0].className}</div>
              <div className="truncate text-xs text-slate-500">
                {homeSessions[0].wd} {homeSessions[0].timeLabel}{homeSessions[0].location ? ` · ${homeSessions[0].location}` : ""}
              </div>
            </div>
          </div>
          <span className="shrink-0 text-sm font-medium text-emerald-700">Schedule →</span>
        </Link>
      )}

      {/* ─── Fees — kept calm and last ───────────────────────────────────── */}
      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Fees</h2>
        {unpaid && unpaid > 0 ? (
          <Link
            href="/parent/invoices"
            className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 transition-colors hover:bg-slate-100"
          >
            <div className="min-w-0">
              <div className="text-base font-semibold text-slate-900">
                {formatCurrency(totalOutstanding, outCurrency)} outstanding
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {unpaid} invoice{unpaid > 1 ? "s" : ""} — settle whenever it&apos;s convenient
              </div>
            </div>
            <span className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-emerald-600 px-4 py-2 text-sm font-semibold text-emerald-700 transition-colors hover:bg-emerald-50">
              View &amp; pay
            </span>
          </Link>
        ) : (
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-600">
            You&apos;re all paid up — thank you!
          </div>
        )}
      </div>
    </div>
  );
}
