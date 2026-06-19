import Link from "next/link";
import { Clock, MapPin, User, Users } from "lucide-react";
import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  PageHeader, StatCard, Card, EmptyState, Badge, Avatar,
} from "@/components/ui";
import { formatCurrency, formatTime } from "@/lib/format";
import type { FeeInterval } from "@/lib/types";

export const dynamic = "force-dynamic";

const INTERVAL_SUFFIX: Record<FeeInterval, string> = { monthly: "/mo", one_time: "" };

export default async function ParentDashboard() {
  const me = await requireParent();
  const supabase = createAdminClient();

  const { data: children } = await supabase
    .from("students")
    .select("id, full_name, status, photo_url")
    .eq("parent_id", me.id)
    .order("full_name");

  const childIds = (children ?? []).map((c) => c.id);

  // Level (class) + package fees (fee plan & outstanding balance) per child.
  const [{ data: enrollments }, { data: invoices }, { count: unpaid }, { count: scorecards }] =
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
            .select("*", { count: "exact", head: true })
            .in("student_id", childIds)
        : Promise.resolve({ count: 0 }),
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
        .select("id, session_date, start_time, end_time, location, class_id")
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

  return (
    <div>
      <PageHeader title={`Hello, ${me.full_name ?? "Parent"}`} />

      <div className="grid grid-cols-2 gap-4">
        <StatCard label="Unpaid invoices" value={unpaid ?? 0} tone={unpaid ? "red" : "green"} />
      </div>

      {/* ─── Upcoming sessions ──────────────────────────────────────────── */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming sessions</h2>
          <Link href="/parent/schedule" className="text-sm font-medium text-emerald-700 hover:underline">
            View all →
          </Link>
        </div>
        {upcomingSessions && upcomingSessions.length > 0 ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {(upcomingSessions as any[]).map((s) => {
              const names = classToChild.get(s.class_id) ?? [];
              const clsName = classNameMap.get(s.class_id) ?? "—";
              const d = new Date(`${s.session_date}T00:00:00`);
              const mon = d.toLocaleDateString("en-MY", { month: "short" });
              const wd = d.toLocaleDateString("en-MY", { weekday: "short" });
              return (
                <div key={s.id} className="flex items-center gap-3.5 px-4 py-3.5">
                  <div className="flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-emerald-50">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600">{mon}</span>
                    <span className="text-xl font-bold leading-none text-emerald-800">{d.getDate()}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-slate-900">{clsName}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
                      <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{wd} {formatTime(s.start_time)}–{formatTime(s.end_time)}</span>
                      {s.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.location}</span>}
                      {classCoach.get(s.class_id) && <span className="inline-flex items-center gap-1"><User className="h-3.5 w-3.5" />Coach {classCoach.get(s.class_id)}</span>}
                      {childIds.length > 1 && names.length > 0 && (
                        <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" />{names.join(", ")}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No upcoming sessions.</p>
        )}
      </div>

      <h2 className="mb-4 mt-8 text-lg font-semibold text-slate-900">Your children</h2>

      {children && children.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {children.map((c) => {
            const clsName = classByChild.get(c.id);
            const fees = feesByChild.get(c.id);
            const plan = fees?.plan;
            const outstanding = fees?.outstanding ?? 0;
            const currency = fees?.currency ?? plan?.currency ?? "MYR";
            return (
              <Link key={c.id} href={`/parent/children/${c.id}`} className="group">
                <Card className="h-full p-5 transition-all hover:border-emerald-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <Avatar name={c.full_name} src={(c as any).photo_url} size={44} />
                      <div>
                        <div className="text-base font-semibold text-slate-900 group-hover:text-emerald-700">
                          {c.full_name}
                        </div>
                        <div className="mt-1 text-sm text-slate-500">{clsName ?? "Not enrolled"}</div>
                      </div>
                    </div>
                    <Badge tone={c.status === "active" ? "green" : "slate"}>{c.status}</Badge>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-3 border-t border-slate-100 pt-3">
                    <div className="text-sm">
                      {plan ? (
                        <span className="font-semibold text-slate-900">
                          {formatCurrency(Number(plan.amount), plan.currency)}
                          <span className="text-xs font-medium text-slate-400">{INTERVAL_SUFFIX[plan.interval as FeeInterval]}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">No package</span>
                      )}
                    </div>
                    {outstanding > 0 ? (
                      <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 ring-1 ring-inset ring-red-600/20">
                        {formatCurrency(outstanding, currency)} due
                      </span>
                    ) : (
                      <span className="rounded-full bg-green-50 px-2.5 py-1 text-xs font-medium text-green-700 ring-1 ring-inset ring-green-600/20">
                        Paid up
                      </span>
                    )}
                  </div>
                </Card>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState message="No children linked to your account yet. Contact the academy." />
      )}
    </div>
  );
}
