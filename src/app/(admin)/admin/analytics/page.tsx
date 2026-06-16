import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Section, Table, Th, Td, EmptyState, LinkButton, Badge } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { computeAnalytics } from "@/lib/analytics";

export const dynamic = "force-dynamic";

function Bars({ data, tones }: { data: Record<string, number>; tones?: Record<string, string> }) {
  const entries = Object.entries(data);
  const max = Math.max(1, ...entries.map(([, v]) => v));
  if (entries.length === 0) return <EmptyState message="No data yet." />;
  return (
    <div className="space-y-2.5">
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-center gap-3 text-sm">
          <span className="w-24 shrink-0 capitalize text-slate-600">{k}</span>
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-2.5 rounded-full ${tones?.[k] ?? "bg-green-500"}`}
              style={{ width: `${(v / max) * 100}%` }}
            />
          </div>
          <span className="w-8 text-right font-medium tabular-nums text-slate-700">{v}</span>
        </div>
      ))}
    </div>
  );
}

export default async function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const supabase = await createClient();
  const { month } = await searchParams;
  const nowD = new Date();
  const monthStr = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;
  const [my, mm] = monthStr.split("-").map(Number);
  const a = await computeAnalytics(supabase, new Date(my, mm - 1, 1));
  const prevM = `${mm === 1 ? my - 1 : my}-${String(mm === 1 ? 12 : mm - 1).padStart(2, "0")}`;
  const nextM = `${mm === 12 ? my + 1 : my}-${String(mm === 12 ? 1 : mm + 1).padStart(2, "0")}`;
  const thisM = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, "0")}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Analytics"
        description={`Academy metrics · ${a.monthLabel}`}
        action={
          <div className="flex flex-wrap items-center gap-1.5">
            <LinkButton href={`/admin/analytics?month=${prevM}`} variant="secondary" aria-label="Previous month">←</LinkButton>
            <LinkButton href={`/admin/analytics?month=${thisM}`} variant="secondary">This month</LinkButton>
            <LinkButton href={`/admin/analytics?month=${nextM}`} variant="secondary" aria-label="Next month">→</LinkButton>
            <LinkButton href={`/api/analytics/pdf?month=${monthStr}`} target="_blank" rel="noopener">PDF</LinkButton>
            <LinkButton href={`/api/analytics/csv?month=${monthStr}`} target="_blank" rel="noopener" variant="secondary">CSV</LinkButton>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Revenue (this month)" value={formatCurrency(a.revenueThisMonth, a.currency)} tone="green" />
        <StatCard
          label="Collection rate"
          value={a.collection.rate != null ? `${a.collection.rate}%` : "—"}
          sub={`${formatCurrency(a.collection.collected, a.currency)} / ${formatCurrency(a.collection.billed, a.currency)}`}
          tone={a.collection.rate == null ? "slate" : a.collection.rate >= 80 ? "green" : a.collection.rate >= 50 ? "amber" : "red"}
        />
        <StatCard label="Outstanding fees" value={formatCurrency(a.outstanding, a.currency)} tone={a.outstanding > 0 ? "red" : "slate"} />
        <StatCard label="Attendance rate" value={a.attendanceRate != null ? `${a.attendanceRate}%` : "—"} tone="blue" />
        <StatCard label="Avg skill score" value={a.avgScore != null ? `${a.avgScore}%` : "—"} sub={`${a.assessmentCount} assessments`} />
      </div>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Active students" value={a.counts.students} />
        <StatCard label="New this month" value={a.newStudentsThisMonth} tone={a.newStudentsThisMonth ? "green" : "slate"} />
        <StatCard label="Coaches" value={a.counts.coaches} />
        <StatCard label="Parents" value={a.counts.parents} />
        <StatCard label="Active classes" value={a.counts.classes} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Revenue trend" description="Succeeded payments, last 6 months">
          {a.revenueTrend.some((m) => m.amount > 0) ? (
            <div className="space-y-2.5">
              {(() => {
                const max = Math.max(1, ...a.revenueTrend.map((m) => m.amount));
                return a.revenueTrend.map((m) => (
                  <div key={m.label} className="flex items-center gap-3 text-sm">
                    <span className="w-10 shrink-0 text-slate-600">{m.label}</span>
                    <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-100">
                      <div className="h-2.5 rounded-full bg-green-500" style={{ width: `${(m.amount / max) * 100}%` }} />
                    </div>
                    <span className="w-24 text-right font-medium tabular-nums text-slate-700">
                      {formatCurrency(m.amount, a.currency)}
                    </span>
                  </div>
                ));
              })()}
            </div>
          ) : (
            <EmptyState message="No payments in the last 6 months." />
          )}
        </Section>

        <Section title="Students per class" flush>
          {a.studentsPerClass.length ? (
            <Table>
              <thead><tr><Th>Class</Th><Th className="text-right">Students</Th></tr></thead>
              <tbody>
                {a.studentsPerClass.map((c) => (
                  <tr key={c.name} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{c.name}</Td>
                    <Td className="text-right tabular-nums">{c.count}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <div className="p-5"><EmptyState message="No active enrolments yet." /></div>}
        </Section>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Students by rank" description="Effective class rank across active students">
          <Bars
            data={a.rankDistribution}
            tones={{ Beginner: "bg-green-500", Intermediate: "bg-blue-500", Advanced: "bg-amber-500", Elite: "bg-purple-500", Unranked: "bg-slate-400" }}
          />
        </Section>

        <Section title="Attendance breakdown">
          <Bars
            data={a.attendanceBreakdown}
            tones={{ present: "bg-green-500", late: "bg-amber-500", absent: "bg-red-500", excused: "bg-slate-400" }}
          />
        </Section>

        <Section title="Invoices by status">
          <Bars data={a.invoiceStatus} tones={{ paid: "bg-green-500", unpaid: "bg-amber-500", overdue: "bg-red-500" }} />
        </Section>

        <Section title="Reward leaderboard" flush>
          {a.topStudents.length ? (
            <Table>
              <thead><tr><Th>#</Th><Th>Student</Th><Th className="text-right">Points</Th></tr></thead>
              <tbody>
                {a.topStudents.map((s, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td className="text-slate-400">{i + 1}</Td>
                    <Td className="font-medium text-slate-900">{s.name}</Td>
                    <Td className="text-right"><Badge tone="green">{s.points}</Badge></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          ) : <div className="p-5"><EmptyState message="No rewards awarded yet." /></div>}
        </Section>

        <Section title="WhatsApp delivery">
          <Bars
            data={a.messageStatus}
            tones={{ delivered: "bg-green-500", read: "bg-green-600", sent: "bg-blue-500", queued: "bg-slate-400", failed: "bg-red-500" }}
          />
        </Section>
      </div>
    </div>
  );
}
