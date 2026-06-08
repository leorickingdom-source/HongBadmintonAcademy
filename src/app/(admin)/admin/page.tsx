import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Card, Badge, EmptyState } from "@/components/ui";
import { formatCurrency, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

async function count(table: string, filter?: (q: any) => any) {
  const supabase = await createClient();
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

export default async function AdminDashboard() {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA");

  const [students, coaches, parents, classes, unpaid, queued] = await Promise.all([
    count("students", (q) => q.eq("status", "active")),
    count("profiles", (q) => q.eq("role", "coach")),
    count("profiles", (q) => q.eq("role", "parent")),
    count("classes", (q) => q.eq("is_active", true)),
    count("invoices", (q) => q.in("status", ["unpaid", "overdue"])),
    count("messages", (q) => q.eq("status", "queued")),
  ]);

  const { data: todaySessions } = await supabase
    .from("sessions")
    .select("id, start_time, end_time, location, status, classes(name)")
    .eq("session_date", today)
    .order("start_time");

  return (
    <div>
      <PageHeader
        title="Dashboard"
        description="Academy overview at a glance."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <StatCard label="Active students" value={students} />
        <StatCard label="Coaches" value={coaches} />
        <StatCard label="Parents" value={parents} />
        <StatCard label="Active classes" value={classes} />
        <StatCard label="Unpaid invoices" value={unpaid} sub="incl. overdue" />
        <StatCard label="Queued messages" value={queued} sub="WhatsApp" />
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Today&apos;s sessions</h2>
        {todaySessions && todaySessions.length > 0 ? (
          <Card className="divide-y divide-slate-100">
            {todaySessions.map((s: any) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="font-medium text-slate-800">{s.classes?.name ?? "Class"}</div>
                  <div className="text-sm text-slate-500">
                    {formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.location ?? "—"}
                  </div>
                </div>
                <Badge tone={s.status === "completed" ? "green" : "blue"}>{s.status}</Badge>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState message="No sessions scheduled today." />
        )}
      </div>
    </div>
  );
}
