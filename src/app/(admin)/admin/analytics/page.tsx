import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { getViewBranchId, listBranches } from "@/lib/branch";
import { PageHeader, StatCard, Section, Collapsible, Table, Th, Td, EmptyState, LinkButton, Badge, cn } from "@/components/ui";
import { FilterSelect } from "@/components/filter-controls";
import { formatCurrency } from "@/lib/format";
import { rankBadgeClass } from "@/lib/ranks";
import { LEVEL_NAMES } from "@/lib/training";
import { computeAnalytics } from "@/lib/analytics";
import { RevenueAreaChart, CountBarChart, SkillBarChart, CategoryBarChart } from "@/components/charts";
import { dict } from "@/lib/i18n";

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
  searchParams: Promise<{ month?: string; branch?: string }>;
}) {
  // Super-admins get the full picture (incl. money) across any branch. Branch
  // admins get a scoped, NON-FINANCE view (attendance/retention/occupancy/exams/
  // funnel) of their own branch — money stays super-admin only (collections is
  // their finance surface).
  const me = await requireRole("admin");
  const isSuper = me.role === "super_admin";
  const L = dict(me.locale);
  const supabase = await createClient();
  const { month, branch } = await searchParams;
  const nowD = new Date();
  const monthStr = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  const [my, mm] = monthStr.split("-").map(Number);
  // Branch filter: super-admin picks (explicit ?branch= wins, else global
  // switcher); a branch-admin is pinned to their own branch.
  const branches = await listBranches(false);
  const branchParam = isSuper && branch && branch !== "all" && branches.some((b) => b.id === branch) ? branch : null;
  const bf = isSuper ? (branchParam ?? await getViewBranchId(me)) : (me.branch_id ?? null);
  const branchLabel = bf ? branches.find((b) => b.id === bf)?.name ?? null : null;
  const bq = branchParam ? `&branch=${branchParam}` : "";
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
        title={L.ana_title}
        description={branchLabel ? `${branchLabel} — ${L.ana_desc_branch}` : L.ana_desc_all}
        action={isSuper ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <LinkButton href={`/api/analytics/pdf?month=${monthStr}`} target="_blank" rel="noopener" variant="secondary">PDF</LinkButton>
            <LinkButton href={`/api/analytics/csv?month=${monthStr}`} target="_blank" rel="noopener" variant="secondary">CSV</LinkButton>
          </div>
        ) : undefined}
      />

      {/* Branch filter (super-admin) — pick one branch or all. */}
      {isSuper && branches.length > 1 && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-600">{L.branch}</span>
          <FilterSelect name="branch" defaultValue={branchParam ?? ""} className="h-9 w-52">
            <option value="">{L.dir_all_branches}</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </FilterSelect>
        </label>
      )}

      {/* Period control — the one filter, made obvious. */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <Link href={`/admin/analytics?month=${prevM}${bq}`} aria-label={L.cs_prev_month} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-900">{a.monthLabel}</div>
          {monthStr !== thisM && (
            <Link href={`/admin/analytics?month=${thisM}${bq}`} className="text-xs font-medium text-green-700 hover:underline">{L.cr_jump_this}</Link>
          )}
        </div>
        <Link href={`/admin/analytics?month=${nextM}${bq}`} aria-label={L.cs_next_month} className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      {/* Headline KPIs — health of the academy at a glance. Colour = look here.
          Money cards are super-admin only; branch admins see growth/quality KPIs. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {isSuper && <StatCard label={L.ana_revenue_month} value={formatCurrency(a.revenueThisMonth, a.currency)} tone="green" />}
        {isSuper && (
          <StatCard
            label={L.coll_rate}
            value={a.collection.rate != null ? `${a.collection.rate}%` : "—"}
            sub={a.outstanding > 0 ? `${formatCurrency(a.outstanding, a.currency)} ${L.ana_outstanding_sub}` : L.ana_all_collected}
            tone={collTone}
          />
        )}
        <StatCard label={L.adm_active_students} value={a.counts.students} sub={a.newStudentsThisMonth ? L.ana_new_sub.replace("{n}", String(a.newStudentsThisMonth)) : undefined} tone="blue" />
        <StatCard label={L.ana_att_rate} value={a.attendanceRate != null ? `${a.attendanceRate}%` : "—"} sub={L.ana_this_month} tone={attTone} />
        {!isSuper && (
          <StatCard
            label={L.ana_retention}
            value={a.retention.rate != null ? `${a.retention.rate}%` : "—"}
            sub={L.ana_retention_sub2}
            tone={a.retention.rate == null ? "slate" : a.retention.rate >= 80 ? "green" : a.retention.rate >= 60 ? "amber" : "red"}
          />
        )}
        {!isSuper && <StatCard label={L.ana_occupancy} value={a.avgOccupancyPct != null ? `${a.avgOccupancyPct}%` : "—"} sub={L.ana_occupancy_sub} tone="blue" />}
      </div>

      {/* ── Trial funnel (all admins — a growth metric, not finance) ─────────── */}
      <Collapsible title={L.ana_funnel} defaultOpen={false}>
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <StatCard label={L.lead_st_new} value={a.trialFunnel.new} />
            <StatCard label={L.lead_st_contacted} value={a.trialFunnel.contacted} />
            <StatCard label={L.lead_st_trial_booked} value={a.trialFunnel.trial_booked} tone="blue" />
            <StatCard label={L.lead_st_trialed} value={a.trialFunnel.trialed} tone="amber" />
            <StatCard label={L.lead_st_enrolled} value={a.trialFunnel.enrolled} tone="green" />
            <StatCard label={L.lead_st_lost} value={a.trialFunnel.lost} tone={a.trialFunnel.lost ? "red" : "slate"} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <StatCard
              label={L.ana_funnel_conv}
              value={a.trialFunnel.convRate != null ? `${a.trialFunnel.convRate}%` : "—"}
              sub={L.ana_funnel_conv_sub.replace("{n}", String(a.trialFunnel.total))}
              tone={a.trialFunnel.convRate != null && a.trialFunnel.convRate >= 30 ? "green" : "amber"}
            />
            <Section title={L.ana_funnel} description={L.ana_funnel_desc}>
              {a.trialFunnel.total ? (
                <CategoryBarChart
                  data={[
                    { name: L.lead_st_new, value: a.trialFunnel.new, color: "#94a3b8" },
                    { name: L.lead_st_contacted, value: a.trialFunnel.contacted, color: "#3b82f6" },
                    { name: L.lead_st_trial_booked, value: a.trialFunnel.trial_booked, color: "#6366f1" },
                    { name: L.lead_st_trialed, value: a.trialFunnel.trialed, color: "#f59e0b" },
                    { name: L.lead_st_enrolled, value: a.trialFunnel.enrolled, color: "#16a34a" },
                    { name: L.lead_st_lost, value: a.trialFunnel.lost, color: "#ef4444" },
                  ]}
                />
              ) : <EmptyState message={L.ana_funnel_empty} />}
            </Section>
          </div>
          <LinkButton href="/admin/leads" variant="secondary">{L.ana_funnel_manage}</LinkButton>
        </div>
      </Collapsible>

      {/* ── Money (super-admin only) ──────────────────────────────────────── */}
      {isSuper && (
      <Collapsible title={L.ana_money} defaultOpen={false}>
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label={L.pot_billed} value={formatCurrency(a.collection.billed, a.currency)} />
            <StatCard label={L.coll_collected} value={formatCurrency(a.collection.collected, a.currency)} tone="green" />
            <StatCard label={L.adm_outstanding} value={formatCurrency(a.outstanding, a.currency)} tone={a.outstanding > 0 ? "red" : "slate"} />
            <StatCard label={L.ana_90_late} value={formatCurrency(a.feeAging.d90, a.currency)} tone={a.feeAging.d90 > 0 ? "red" : "slate"} />
          </div>
          {/* Court rental cost folded in → net of what was collected. */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard label={L.ana_court_cost} value={formatCurrency(a.courtRentalCost, a.currency)} tone={a.courtRentalCost > 0 ? "amber" : "slate"} />
            <StatCard label={L.ana_net} value={formatCurrency(a.netRevenue, a.currency)} tone={a.netRevenue >= 0 ? "green" : "red"} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={L.ana_rev_trend} description={L.ana_rev_trend_desc}>
              {a.revenueTrend.some((m) => m.amount > 0) ? (
                <RevenueAreaChart data={a.revenueTrend} currency={a.currency} />
              ) : <EmptyState message={L.ana_no_pay_6mo} />}
            </Section>
            <Section title={L.ana_fee_aging} description={L.ana_fee_aging_desc}>
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: L.coll_b1, v: a.feeAging.d0, tone: "text-slate-700" },
                  { label: L.coll_b2, v: a.feeAging.d30, tone: "text-amber-600" },
                  { label: L.coll_b3, v: a.feeAging.d60, tone: "text-orange-600" },
                  { label: L.coll_b4, v: a.feeAging.d90, tone: "text-red-600" },
                ].map((b) => (
                  <div key={b.label} className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                    <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{b.label}</div>
                    <div className={cn("mt-1 text-lg font-bold tabular-nums", b.tone)}>{formatCurrency(b.v, a.currency)}</div>
                  </div>
                ))}
              </div>
            </Section>
          </div>
          <Section title={L.ana_inv_by_status}>
            {Object.keys(a.invoiceStatus).length ? (
              <CategoryBarChart data={recordToBars(a.invoiceStatus, INV_COLOR)} />
            ) : <EmptyState message={L.ana_no_invoices} />}
          </Section>
        </div>
      </Collapsible>
      )}

      {/* ── Students & attendance ─────────────────────────────────────────── */}
      <Collapsible title={L.ana_students_att} defaultOpen={false}>
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              label={L.ana_retention}
              value={a.retention.rate != null ? `${a.retention.rate}%` : "—"}
              sub={L.ana_retention_sub2}
              tone={a.retention.rate == null ? "slate" : a.retention.rate >= 80 ? "green" : a.retention.rate >= 60 ? "amber" : "red"}
            />
            <StatCard label={L.ana_noshow} value={a.retention.inactive30} tone={a.retention.inactive30 ? "red" : "green"} />
            <StatCard label={L.ana_inactive} value={a.inactiveStudents} tone={a.inactiveStudents ? "amber" : "slate"} />
            <StatCard label={L.ana_occupancy} value={a.avgOccupancyPct != null ? `${a.avgOccupancyPct}%` : "—"} sub={L.ana_occupancy_sub} tone="blue" />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={L.ana_att_breakdown}>
              <CategoryBarChart
                data={[
                  { name: L.att_present, value: a.attendanceBreakdown.present, color: "#16a34a" },
                  { name: L.att_late, value: a.attendanceBreakdown.late, color: "#f59e0b" },
                  { name: L.att_absent, value: a.attendanceBreakdown.absent, color: "#ef4444" },
                  { name: L.att_excused, value: a.attendanceBreakdown.excused, color: "#94a3b8" },
                ]}
              />
            </Section>
            <Section title={L.ana_new_students} description={L.ana_new_students_desc}>
              {a.newStudentTrend.some((m) => m.count > 0) ? (
                <CountBarChart data={a.newStudentTrend} />
              ) : <EmptyState message={L.ana_no_signups} />}
            </Section>
          </div>
          <Section title={L.ana_occupancy} description={L.ana_occupancy_desc} flush>
            {a.classOccupancy.length ? (
              <Table>
                <thead><tr><Th>{L.class_word}</Th><Th className="text-right">{L.ana_filled}</Th><Th className="text-right">{L.ana_occupancy_col}</Th></tr></thead>
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
            ) : <div className="p-5"><EmptyState message={L.ana_set_capacity} /></div>}
          </Section>
        </div>
      </Collapsible>

      {/* ── Coaching & progress ───────────────────────────────────────────── */}
      <Collapsible title={L.ana_coaching} defaultOpen={false}>
        <div className="space-y-6 p-5">
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-2">
            <StatCard
              label={L.ana_avg_exam}
              value={a.avgScore != null ? `${a.avgScore}/100` : "—"}
              sub={a.avgScore != null
                ? `${L.ana_exams_year.replace("{n}", String(a.assessmentCount))}${a.skillImprovement != null ? ` · ${a.skillImprovement >= 0 ? "+" : ""}${a.skillImprovement} ${L.ana_vs_last}` : ""}`
                : L.ana_no_exams_year}
              tone={a.skillImprovement != null ? (a.skillImprovement >= 0 ? "green" : "red") : "slate"}
            />
            <StatCard label={L.ana_active_classes} value={a.counts.classes} />
          </div>
          <div className="grid gap-6 lg:grid-cols-2">
            <Section title={L.ana_exam_sections} description={L.ana_exam_sections_desc}>
              {a.skillsBreakdown.length ? (
                <SkillBarChart data={a.skillsBreakdown} />
              ) : <EmptyState message={L.ana_no_exams_scored} />}
            </Section>
            <Section title={L.ex_by_level} flush>
              <Table>
                <thead><tr><Th>{L.level_word}</Th><Th className="text-right">{L.cls_students}</Th><Th className="text-right">{L.ana_share}</Th></tr></thead>
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
          <Section title={L.ana_coach_perf} description={L.ana_coach_perf_desc} flush>
            {a.coachPerformance.length ? (
              <Table>
                <thead><tr><Th>{L.adm_coach}</Th><Th className="text-right">{L.cls_students}</Th><Th className="text-right">{L.ana_att_col}</Th><Th className="text-right">{L.ana_avg_exam_given}</Th></tr></thead>
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
            ) : <div className="p-5"><EmptyState message={L.ana_no_coaches} /></div>}
          </Section>
        </div>
      </Collapsible>

    </div>
  );
}
