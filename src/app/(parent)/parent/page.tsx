import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Card, EmptyState, LinkButton, Badge } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function ParentDashboard() {
  const me = await requireRole("parent");
  const supabase = await createClient();

  const { data: children } = await supabase
    .from("students")
    .select("id, full_name, status")
    .eq("parent_id", me.id)
    .order("full_name");

  const [{ count: unpaid }, { count: scorecards }] = await Promise.all([
    supabase.from("invoices").select("*", { count: "exact", head: true }).in("status", ["unpaid", "overdue"]),
    supabase.from("scorecards").select("*", { count: "exact", head: true }),
  ]);

  return (
    <div>
      <PageHeader title={`Hello, ${me.full_name ?? "Parent"}`} description="Your children's progress and fees." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Children" value={children?.length ?? 0} />
        <StatCard label="Unpaid invoices" value={unpaid ?? 0} />
        <StatCard label="Score cards" value={scorecards ?? 0} />
      </div>

      <div className="mt-8 flex gap-3">
        <LinkButton href="/parent/scorecards">View score cards</LinkButton>
        <LinkButton href="/parent/invoices" variant="secondary">Fees &amp; payments</LinkButton>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Your children</h2>
        {children && children.length > 0 ? (
          <Card className="divide-y divide-slate-100">
            {children.map((c) => (
              <div key={c.id} className="flex items-center justify-between px-5 py-3">
                <span className="font-medium text-slate-800">{c.full_name}</span>
                <Badge tone={c.status === "active" ? "green" : "slate"}>{c.status}</Badge>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState message="No children linked to your account yet. Contact the academy." />
        )}
      </div>
    </div>
  );
}
