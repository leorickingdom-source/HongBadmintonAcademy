import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, StatCard, Card, EmptyState, Badge,
} from "@/components/ui";
import { formatCurrency, formatDate, formatTime } from "@/lib/format";
import type { FeeInterval } from "@/lib/types";

export const dynamic = "force-dynamic";

const INTERVAL_SUFFIX: Record<FeeInterval, string> = { monthly: "/mo", one_time: "" };

const PARENT_ACTIONS = [
  { href: "/parent/scorecards", icon: "📊", title: "Score cards", sub: "Monthly reports" },
  { href: "/parent/invoices", icon: "💳", title: "Fees & payments", sub: "Pay & history" },
];

export default async function ParentDashboard() {
  const me = await requireRole("parent");
  const supabase = await createClient();

  const { data: children } = await supabase
    .from("students")
    .select("id, full_name, status")
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
      supabase.from("invoices").select("*", { count: "exact", head: true }).in("status", ["unpaid", "overdue"]),
      supabase.from("scorecards").select("*", { count: "exact", head: true }),
    ]);

  const classByChild = new Map<string, string>();
  const classIds: string[] = [];
  for (const e of (enrollments ?? []) as any[]) {
    if (e.classes && !classByChild.has(e.student_id)) {
      classByChild.set(e.student_id, e.classes.name);
    }
    if (e.class_id && !classIds.includes(e.class_id)) classIds.push(e.class_id);
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
      <PageHeader
        title={`Hello, ${me.full_name ?? "Parent"}`}
        description="Your children's level, progress and package fees at a glance."
      />

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {PARENT_ACTIONS.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-green-300 hover:shadow-sm"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-50 text-2xl">
              {q.icon}
            </span>
            <div className="min-w-0">
              <div className="font-semibold leading-tight text-slate-900">{q.title}</div>
              <div className="truncate text-xs text-slate-500">{q.sub}</div>
            </div>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Children" value={children?.length ?? 0} />
        <StatCard label="Unpaid invoices" value={unpaid ?? 0} tone={unpaid ? "red" : "green"} />
        <StatCard label="Score cards" value={scorecards ?? 0} />
      </div>

      {/* ─── Upcoming sessions ──────────────────────────────────────────── */}
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Upcoming sessions</h2>
          <Link href="/parent/schedule" className="text-sm font-medium text-green-700 hover:underline">
            View all →
          </Link>
        </div>
        {upcomingSessions && upcomingSessions.length > 0 ? (
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {(upcomingSessions as any[]).map((s) => {
              const names = classToChild.get(s.class_id) ?? [];
              const clsName = classNameMap.get(s.class_id) ?? "—";
              return (
                <div key={s.id} className="flex items-center justify-between px-5 py-4">
                  <div>
                    <div className="font-semibold text-slate-900">{clsName}</div>
                    <div className="text-sm text-slate-500">
                      {formatDate(s.session_date)} · {formatTime(s.start_time)}–{formatTime(s.end_time)}
                      {s.location ? ` · ${s.location}` : ""}
                    </div>
                    {names.length > 0 && (
                      <div className="mt-0.5 text-xs text-slate-400">{names.join(", ")}</div>
                    )}
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
                <Card className="h-full p-5 transition-all hover:border-green-300 hover:shadow-md">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-base font-semibold text-slate-900 group-hover:text-green-700">
                        {c.full_name}
                      </div>
                      <div className="mt-1 text-sm text-slate-500">{clsName ?? "Not enrolled"}</div>
                    </div>
                    <Badge tone={c.status === "active" ? "green" : "slate"}>{c.status}</Badge>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Package
                      </div>
                      <div className="mt-1 text-lg font-bold text-green-700">
                        {plan ? (
                          <>
                            {formatCurrency(Number(plan.amount), plan.currency)}
                            <span className="text-xs font-medium text-slate-400">
                              {INTERVAL_SUFFIX[plan.interval as FeeInterval]}
                            </span>
                          </>
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                      <div className="mt-0.5 truncate text-xs text-slate-500" title={plan?.name ?? ""}>
                        {plan?.name ?? "No package assigned"}
                      </div>
                    </div>

                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
                      <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
                        Outstanding
                      </div>
                      <div className={`mt-1 text-lg font-bold ${outstanding > 0 ? "text-red-600" : "text-green-700"}`}>
                        {outstanding > 0 ? formatCurrency(outstanding, currency) : "Paid up"}
                      </div>
                      <div className="mt-0.5 text-xs text-slate-500">
                        {fees?.unpaidCount
                          ? `${fees.unpaidCount} invoice${fees.unpaidCount > 1 ? "s" : ""} due`
                          : "All settled"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 text-sm font-medium text-slate-500 group-hover:text-green-700">
                    View progress &amp; payments →
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
