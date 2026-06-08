import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, StatCard, Card, EmptyState, LinkButton, Badge,
} from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import type { FeeInterval } from "@/lib/types";

export const dynamic = "force-dynamic";

const INTERVAL_SUFFIX: Record<FeeInterval, string> = { monthly: "/mo", one_time: "" };

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
            .select("student_id, classes(name, level)")
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

  const levelByChild = new Map<string, { name: string; level: string | null }>();
  for (const e of (enrollments ?? []) as any[]) {
    if (e.classes && !levelByChild.has(e.student_id)) {
      levelByChild.set(e.student_id, { name: e.classes.name, level: e.classes.level });
    }
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
        action={
          <LinkButton href="/parent/invoices" variant="secondary">
            Fees &amp; payments
          </LinkButton>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Children" value={children?.length ?? 0} />
        <StatCard label="Unpaid invoices" value={unpaid ?? 0} tone={unpaid ? "red" : "green"} />
        <StatCard label="Score cards" value={scorecards ?? 0} />
      </div>

      <h2 className="mb-4 mt-8 text-lg font-semibold text-slate-900">Your children</h2>

      {children && children.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2">
          {children.map((c) => {
            const lvl = levelByChild.get(c.id);
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
                      <div className="mt-1.5 flex flex-wrap items-center gap-2">
                        {lvl?.level ? (
                          <Badge tone="blue">{lvl.level}</Badge>
                        ) : (
                          <Badge tone="slate">No level</Badge>
                        )}
                        <span className="text-sm text-slate-500">{lvl?.name ?? "Not enrolled"}</span>
                      </div>
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
