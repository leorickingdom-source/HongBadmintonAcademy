import Link from "next/link";
import { Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { getViewBranchId } from "@/lib/branch";
import { PageHeader, StatCard, Collapsible, Badge, EmptyState } from "@/components/ui";
import { formatCurrency, formatTime } from "@/lib/format";
import { dict } from "@/lib/i18n";

export const dynamic = "force-dynamic";

async function count(table: string, filter?: (q: any) => any) {
  const supabase = await createClient();
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) q = filter(q);
  const { count } = await q;
  return count ?? 0;
}

export default async function AdminDashboard() {
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const isSuper = me.role === "super_admin";
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA");
  const stLabel: Record<string, string> = {
    scheduled: L.st_scheduled,
    completed: L.st_completed,
    canceled: L.canceled,
    in_progress: L.coach_in_progress,
  };

  // Super-admin's branch focus (null = all branches / branch-admin = own via RLS).
  const bf = await getViewBranchId(me);
  const branched = (extra?: (q: any) => any) => (q: any) => {
    let qq = extra ? extra(q) : q;
    if (bf) qq = qq.eq("branch_id", bf);
    return qq;
  };

  const [students, coaches, activeClasses, totalClasses, unpaid, queued, pendingLeave, pendingCoachLeave, openCover, newLeads] = await Promise.all([
    count("students", branched((q) => q.eq("status", "active"))),
    count("profiles", branched((q) => q.eq("role", "coach"))),
    count("classes", branched((q) => q.eq("is_active", true))),
    count("classes", branched()),
    count("invoices", branched((q) => q.in("status", ["unpaid", "overdue"]))),
    count("messages", (q) => q.eq("status", "queued")),
    // Needs-attention sources. leave_requests has no direct branch_id (branch is
    // via the joined session), so these count across all branches — the nudge is
    // branch-agnostic and the linked page applies the branch focus itself.
    count("leave_requests", (q) => q.eq("status", "pending")),
    count("coach_leave_requests", (q) => q.eq("status", "pending")),
    count("coach_leave_requests", (q) => q.eq("status", "approved").eq("cover_status", "open")),
    count("trial_leads", branched((q) => q.eq("status", "new"))),
  ]);

  // Task-first: only the things that actually need a decision today, non-zero
  // only. Empty → an "all caught up" line rather than a wall of zeros.
  const actions = [
    { n: unpaid, label: L.adm_unpaid_invoices, href: "/admin/invoices?status=unpaid", tone: "red" as const },
    { n: pendingLeave + pendingCoachLeave, label: L.adm_leave_to_review, href: "/admin/leave", tone: "amber" as const },
    { n: openCover, label: L.adm_cover_to_confirm, href: "/admin/leave", tone: "blue" as const },
    { n: newLeads, label: L.adm_new_leads, href: "/admin/leads?status=new", tone: "green" as const },
  ].filter((a) => a.n > 0);

  let sessQ = supabase
    .from("sessions")
    .select("id, start_time, end_time, location, status, classes(name)")
    .eq("session_date", today);
  if (bf) sessQ = sessQ.eq("branch_id", bf);

  // Finance snapshot — outstanding (unpaid+overdue), overdue tail, and what
  // actually came in this month (succeeded payments, branch via the invoice).
  const myt = new Date(Date.now() + 8 * 3600 * 1000);
  const monthStartISO = new Date(Date.UTC(myt.getUTCFullYear(), myt.getUTCMonth(), 1)).toISOString();
  let outQ = supabase.from("invoices").select("amount, currency, status").in("status", ["unpaid", "overdue"]);
  if (bf) outQ = outQ.eq("branch_id", bf);
  let payQ = supabase
    .from("payments")
    .select("amount, currency, invoices!inner(branch_id)")
    .eq("status", "succeeded")
    .gte("created_at", monthStartISO);
  if (bf) payQ = payQ.eq("invoices.branch_id", bf);

  const [{ data: todaySessions }, { data: outRows }, { data: payRows }] = await Promise.all([
    sessQ.order("start_time"),
    outQ,
    payQ,
  ]);

  const outstanding = (outRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
  const overdueSum = (outRows ?? []).filter((r: any) => r.status === "overdue").reduce((s: number, r: any) => s + Number(r.amount), 0);
  const collected = (payRows ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
  const currency = (outRows ?? [])[0]?.currency ?? (payRows ?? [])[0]?.currency ?? "MYR";

  return (
    <div>
      <PageHeader title={L.dashboard} description={L.dash_today_glance} />

      {/* Needs attention — task-first: what to act on now, leads the page. Only
          non-zero items show; nothing pending → a positive "all caught up" line. */}
      <div className="mb-6 mt-4">
        <h2 className="mb-2.5 text-sm font-semibold text-slate-500">{L.adm_needs_action}</h2>
        {actions.length ? (
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            {actions.map((a) => (
              <Link key={a.label} href={a.href} className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
                <StatCard label={a.label} value={a.n} tone={a.tone} />
              </Link>
            ))}
          </div>
        ) : (
          <div className="rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm font-medium text-green-700">
            {L.adm_all_caught_up}
          </div>
        )}
      </div>

      {/* Everything below is reference, not a to-do — folded away by default so
          the page opens on "Needs attention" alone. One tap reveals the numbers. */}
      <Collapsible title={L.adm_overview} defaultOpen={false}>
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Link href="/admin/people?tab=students" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
              <StatCard label={L.adm_active_students} value={students} tone="green" />
            </Link>
            <Link href="/admin/coaches/summary" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
              <StatCard label={L.adm_coaches_payroll} value={coaches} tone="slate" />
            </Link>
            <Link href="/admin/classes" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
              <StatCard label={L.adm_active_total_classes} value={`${activeClasses} / ${totalClasses}`} tone="blue" />
            </Link>
            <Link href="/admin/messages" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
              <StatCard label={L.adm_queued_messages} value={queued} tone={queued ? "amber" : "slate"} />
            </Link>
          </div>

          {/* Finance — money still out (collected revenue is super-admin only). */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            {isSuper && (
              <Link href="/admin/collections" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
                <StatCard label={L.adm_collected_month} value={formatCurrency(collected, currency)} tone="green" />
              </Link>
            )}
            <Link href="/admin/invoices?status=unpaid" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
              <StatCard label={L.adm_outstanding} value={formatCurrency(outstanding, currency)} tone={outstanding ? "amber" : "slate"} />
            </Link>
            <Link href="/admin/invoices?status=overdue" className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-green-500/40">
              <StatCard label={L.adm_overdue} value={formatCurrency(overdueSum, currency)} tone={overdueSum ? "red" : "slate"} />
            </Link>
          </div>

          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{L.adm_todays_sessions}</h3>
            {todaySessions && todaySessions.length > 0 ? (
              <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
                {todaySessions.map((s: any) => (
                  <Link key={s.id} href={`/admin/attendance/${s.id}`} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50">
                    <div className="flex h-12 w-14 shrink-0 flex-col items-center justify-center rounded-xl bg-blue-50">
                      <Clock className="h-4 w-4 text-blue-600" />
                      <span className="mt-0.5 text-[11px] font-semibold leading-none text-blue-700">{formatTime(s.start_time)}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold text-slate-900">{s.classes?.name ?? L.class_word}</div>
                      <div className="text-sm text-slate-500">{formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.location ?? "—"}</div>
                    </div>
                    <Badge tone={s.status === "completed" ? "green" : "blue"}>{stLabel[s.status] ?? s.status}</Badge>
                  </Link>
                ))}
              </div>
            ) : (
              <EmptyState message={L.no_sessions_today} />
            )}
          </div>
        </div>
      </Collapsible>
    </div>
  );
}
