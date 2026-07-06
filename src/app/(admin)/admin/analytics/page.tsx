import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getViewBranchId, listBranches } from "@/lib/branch";
import { PageHeader, StatCard, Section, Collapsible, Table, Th, Td, EmptyState, LinkButton, Badge, cn } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { rankBadgeClass } from "@/lib/ranks";
import { LEVEL_NAMES } from "@/lib/training";
import { computeAnalytics } from "@/lib/analytics";
import { RevenueAreaChart, CountBarChart, SkillBarChart, CategoryBarChart } from "@/components/charts";

export const dynamic = "force-dynamic";

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const INV_COLOR: Record<string, string> = { paid: "#16a34a", unpaid: "#f59e0b", overdue: "#ef4444", draft: "#94a3b8", canceled: "#cbd5e1", refunded: "#64748b" };
const MSG_COLOR: Record<string, string> = { delivered: "#16a34a", read: "#15803d", sent: "#3b82f6", queued: "#94a3b8", failed: "#ef4444" };
function recordToBars(data: Record<string, number>, colors: Record<string, string>) {
  return Object.entries(data).map(([k, v]) => ({ name: cap(k), value: v, color: colors[k] ?? "#94a3b8" }));
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  // Revenue-heavy academy analytics are super-admin only; branch admins are
  // scoped to follow-up collections (see /admin/collections).
  const me = await requireSuperAdmin();
  const supabase = await createClient();
  const { month } = await searchParams;
  const nowD = new Date();
  const monthStr = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  const [my, mm] = monthStr.split("-").map(Number);
  // Super-admin: scope to the branch they're viewing (null = all). Branch-admin:
  // RLS already restricts every table, so null still shows only their branch.
  const bf = await getViewBranchId(me);
  const branchLabel = bf ? (await listBranches(false)).find((b) => b.id === bf)?.name ?? null : null;
  const a = await computeAnalytics(supabase, new Date(my, mm - 1, 1), bf);
  const prevM = `${mm === 1 ? my - 1 : my}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`;
  const nextM = `${mm === 12 ? my + 1 : my}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`;
  const thisM = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;

  const rankTotal = Object.values(a.rankDistribution).reduce((x, y) => x + y, 0);

  // Lead with the four numbers an owner actually steers by; everything else is
  // grouped under collapsible drill-downs so the page isn't a wall of figures.
  const collTone = a.collection.rate == null ? "slate" : a.collection.rate >= 80 ? "green" : a.collection.rate >= 50 ? "amber" : "red";
  const attTone = a.attendanceRate == null ? "slate" : a.attendanceRate >= 75 ? "green" : a.attendanceRate >= 50 ? "amber" : "red";

  return (
    <div className="space-y-5">
      <PageHeader
        title="Analytics"
        description={branchLabel ? `${branchLabel} branch — open a section below for detail.` : "The headline numbers first — open a section below for detail."}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <LinkButton href={`/api/analytics/pdf?month=${monthStr}`} target="_blank" rel="noopener" variant="secondary">PDF</LinkButton>
            <LinkButton href={`/api/analytics/csv?month=${monthStr}`} target="_blank" rel="noopener" variant="secondary">CSV</LinkButton>
          </div>
        }
      />

      {/* Period control — the one filter, made obvious. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <Link href={`/admin/analytics?month=${prevM}`} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-900">{a.monthLabel}</div>
          {monthStr !== thisM && (
            <Link href={`/admin/analytics?month=${thisM}`} className="text-xs font-medium text-green-700 hover:underline">Jump to this month</Link>
          )}
        </div>
        <Link href={`/admin/analytics?month=${nextM}`} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      {/* Headline KPIs — health of the academy at a glance. Colour = look here. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Revenue this month" value={formatCurrency(a.revenueThisMonth, a.currency)} tone="green" />
        <StatCard
          label="Collection rate"
          value={a.collection.rate != null ? `${a.collection.rate}%` : "—"}
          sub={a.outstanding > 0 ? `${formatCurrency(a.outstanding, a.currency)} outstanding` : "all collected"}
          tone={collTone}
        />
        <StatCard label="Active students" value={a.counts.students} sub={a.newStudentsThisMonth ? `+${a.newStudentsThisMonth} this month` : undefined} tone="blue" />
        <StatCard label="Attendance rate" value={a.attendanceRate != null ? `${a.attendanceRate}%` : "—"} sub="this month" tone={attTone} />
      </div>

      {/* ── Money ─────────────────────────────────────────────────────────── */}
      <Collapsible title="Money" defaultOpen={false}>
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label="Billed" value={formatCurrency(a.collection.billed, a.currency)} />
            <StatCard label="Collected" value={formatCurrency(a.collection.collected, a.currency)} tone="green" />
            <StatCard label="Outstanding" value={formatCurrency(a.outstanding, a.currency)} tone={a.outstanding > 0 ? "red" : "slate"} />
            <StatCard label="90+ days late" value={formatCurrency(a.feeAging.d90, a.currency)} tone={a.feeAging.d90 > 0 ? "red" : "slate"} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Revenue trend" description="Succeeded payments, last 6 months">
              {a.revenueTrend.some((m) => m.amount > 0) ? (
                <RevenueAreaChart data={a.revenueTrend} currency={a.currency} />
              ) : <EmptyState message="No payments in the last 6 months." />}
            </Section>
            <Section title="Fee aging" description="Unpaid / overdue, by days past due">
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: "0–30 days", v: a.feeAging.d0, tone: "text-slate-700" },
                  { label: "31–60 days", v: a.feeAging.d30, tone: "text-amber-600" },
                  { label: "61–90 days", v: a.feeAging.d60, tone: "text-orange-600" },
                  { label: "90+ days", v: a.feeAging.d90, tone: "text-red-600" },
                ].map((b) => (
                  <div key={b.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{b.label}</div>
                    <div className={cn("mt-1 text-lg font-bold tabular-nums", b.tone)}>{formatCurrency(b.v, a.currency)}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
          <Section title="Invoices by status">
            {Object.keys(a.invoiceStatus).length ? (
              <CategoryBarChart data={recordToBars(a.invoiceStatus, INV_COLOR)} />
            ) : <EmptyState message="No invoices yet." />}
          </Section>
        </div>
      </Collapsible>

      {/* ── Students & attendance ─────────────────────────────────────────── */}
      <Collapsible title="Students & attendance" defaultOpen={false}>
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label="Retention (30d)"
              value={a.retention.rate != null ? `${a.retention.rate}%` : "—"}
              sub="attended in last 30 days"
              tone={a.retention.rate == null ? "slate" : a.retention.rate >= 80 ? "green" : a.retention.rate >= 60 ? "amber" : "red"}
            />
            <StatCard label="No-show >30 days" value={a.retention.inactive30} tone={a.retention.inactive30 ? "red" : "green"} />
            <StatCard label="Inactive students" value={a.inactiveStudents} tone={a.inactiveStudents ? "amber" : "slate"} />
            <StatCard label="Class occupancy" value={a.avgOccupancyPct != null ? `${a.avgOccupancyPct}%` : "—"} sub="avg of capacity" tone="blue" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Attendance breakdown">
              <CategoryBarChart
                data={[
                  { name: "Present", value: a.attendanceBreakdown.present, color: "#16a34a" },
                  { name: "Late", value: a.attendanceBreakdown.late, color: "#f59e0b" },
                  { name: "Absent", value: a.attendanceBreakdown.absent, color: "#ef4444" },
                  { name: "Excused", value: a.attendanceBreakdown.excused, color: "#94a3b8" },
                ]}
              />
            </Section>
            <Section title="New students" description="Sign-ups per month, last 6 months">
              {a.newStudentTrend.some((m) => m.count > 0) ? (
                <CountBarChart data={a.newStudentTrend} />
              ) : <EmptyState message="No sign-ups in the last 6 months." />}
            </Section>
          </div>
          <Section title="Class occupancy" description="Enrolled vs capacity" flush>
            {a.classOccupancy.length ? (
              <Table>
                <thead><tr><Th>Class</Th><Th className="text-right">Filled</Th><Th className="text-right">Occupancy</Th></tr></thead>
                <tbody>
                  {a.classOccupancy.map((c) => (
                    <tr key={c.name} className="hover:bg-slate-50">
                      <Td className="font-medium">
                        <Link href={`/admin/classes/${c.id}`} className="text-slate-900 hover:text-green-700 hover:underline">{c.name}</Link>
                      </Td>
                      <Td className="text-right tabular-nums text-slate-500">{c.enrolled}/{c.capacity}</Td>
                      <Td className="text-right">
                        <span className={cn("font-semibold tabular-nums", c.pct >= 90 ? "text-red-600" : c.pct >= 60 ? "text-green-600" : "text-amber-600")}>{c.pct}%</span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <div className="p-5"><EmptyState message="Set a capacity on classes to track occupancy." /></div>}
          </Section>
        </div>
      </Collapsible>

      {/* ── Coaching & progress ───────────────────────────────────────────── */}
      <Collapsible title="Coaching & progress" defaultOpen={false}>
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
            <StatCard
              label="Avg exam score"
              value={a.avgScore != null ? `${a.avgScore}/100` : "—"}
              sub={a.avgScore != null
                ? `${a.assessmentCount} exam${a.assessmentCount === 1 ? "" : "s"} this year${a.skillImprovement != null ? ` · ${a.skillImprovement >= 0 ? "+" : ""}${a.skillImprovement} vs last yr` : ""}`
                : "no exams this year"}
              tone={a.skillImprovement != null ? (a.skillImprovement >= 0 ? "green" : "red") : "slate"}
            />
            <StatCard label="Active classes" value={a.counts.classes} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title="Exam sections" description="Average % per section, this year">
              {a.skillsBreakdown.length ? (
                <SkillBarChart data={a.skillsBreakdown} />
              ) : <EmptyState message="No exams scored this year." />}
            </Section>
            <Section title="Students by level" flush>
              <Table>
                <thead><tr><Th>Level</Th><Th className="text-right">Students</Th><Th className="text-right">Share</Th></tr></thead>
                <tbody>
                  {LEVEL_NAMES.map((r) => {
                    const n = a.rankDistribution[r] ?? 0;
                    return (
                      <tr key={r} className="hover:bg-slate-50">
                        <Td><span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(r))}>{r}</span></Td>
                        <Td className="text-right tabular-nums">{n}</Td>
                        <Td className="text-right tabular-nums text-slate-500">{rankTotal ? Math.round((n / rankTotal) * 100) : 0}%</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Section>
          </div>
          <Section title="Coach performance" description="Students · attendance % (this month) · avg exam given (this year)" flush>
            {a.coachPerformance.length ? (
              <Table>
                <thead><tr><Th>Coach</Th><Th className="text-right">Students</Th><Th className="text-right">Attendance</Th><Th className="text-right">Avg exam given</Th></tr></thead>
                <tbody>
                  {a.coachPerformance.map((c) => (
                    <tr key={c.name} className="hover:bg-slate-50">
                      <Td className="font-medium">
                        <Link href={`/admin/coaches/${c.id}`} className="text-slate-900 hover:text-green-700 hover:underline">{c.name}</Link>
                      </Td>
                      <Td className="text-right tabular-nums">{c.students}</Td>
                      <Td className="text-right tabular-nums">{c.attendancePct != null ? `${c.attendancePct}%` : "—"}</Td>
                      <Td className="text-right tabular-nums">{c.avgSkill != null ? `${c.avgSkill}/100` : "—"}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <div className="p-5"><EmptyState message="No coaches yet." /></div>}
          </Section>
        </div>
      </Collapsible>

      {/* ── Engagement ────────────────────────────────────────────────────── */}
      <Collapsible title="Engagement" defaultOpen={false}>
        <div className="grid gap-6 p-5 lg:grid-cols-2">
          <Section title={`Reward leaderboard · ${a.rewardPeriod}`} flush>
            {a.topStudents.length ? (
              <Table>
                <thead><tr><Th>#</Th><Th>Student</Th><Th className="text-right">Points</Th></tr></thead>
                <tbody>
                  {a.topStudents.map((s, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <Td className="text-slate-400">{i + 1}</Td>
                      <Td className="font-medium">
                        <Link href={`/admin/students/${s.id}`} className="text-slate-900 hover:text-green-700 hover:underline">{s.name}</Link>
                      </Td>
                      <Td className="text-right"><Badge tone="green">{s.points}</Badge></Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <div className="p-5"><EmptyState message="No rewards awarded this month." /></div>}
          </Section>
          <Section title="WhatsApp delivery">
            {Object.keys(a.messageStatus).length ? (
              <CategoryBarChart data={recordToBars(a.messageStatus, MSG_COLOR)} />
            ) : <EmptyState message="No messages yet." />}
          </Section>
        </div>
      </Collapsible>
    </div>
  );
}
