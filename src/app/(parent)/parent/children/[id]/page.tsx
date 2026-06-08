import Link from "next/link";
import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, StatCard, Section, Table, Th, Td, Badge, EmptyState, LinkButton,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatDateTime, formatCurrency, monthLabel } from "@/lib/format";
import type { AttendanceStatus, InvoiceStatus, FeeInterval } from "@/lib/types";
import { payInvoice } from "../../invoices/actions";

export const dynamic = "force-dynamic";

const ATT_TONE: Record<AttendanceStatus, "green" | "yellow" | "red" | "slate"> = {
  present: "green", late: "yellow", absent: "red", excused: "slate",
};
const INV_TONE: Record<InvoiceStatus, "green" | "yellow" | "red" | "slate"> = {
  draft: "slate", unpaid: "yellow", paid: "green", overdue: "red", canceled: "slate", refunded: "slate",
};
const INTERVAL_SUFFIX: Record<FeeInterval, string> = { monthly: "/mo", one_time: "" };

function ageFromDob(dob: string | null): number | null {
  if (!dob) return null;
  const d = new Date(dob);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 3.15576e10);
}

export default async function ChildDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireRole("parent");
  const { id } = await params;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, status, dob")
    .eq("id", id)
    .maybeSingle();
  if (!student) notFound();

  const [
    { data: enrollment },
    { data: attendance },
    { data: assessments },
    { data: ledger },
    { data: invoices },
  ] = await Promise.all([
    supabase
      .from("enrollments")
      .select("classes(name, level)")
      .eq("student_id", id)
      .eq("active", true)
      .limit(1)
      .maybeSingle(),
    supabase
      .from("attendance")
      .select("status, tap_in_at, tap_out_at, sessions(session_date, classes(name))")
      .eq("student_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("assessments")
      .select("assessed_on, overall_score, comment, marking_schemes(name)")
      .eq("student_id", id)
      .order("assessed_on", { ascending: false })
      .limit(20),
    supabase
      .from("reward_ledger")
      .select("points, reason, awarded_at")
      .eq("student_id", id)
      .order("awarded_at", { ascending: false }),
    supabase
      .from("invoices")
      .select("id, invoice_no, amount, currency, status, period_month, due_date, fee_plans(name, amount, currency, interval)")
      .eq("student_id", id)
      .order("period_month", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false }),
  ]);

  const cls = (enrollment as any)?.classes ?? null;
  const age = ageFromDob(student.dob);

  const att = attendance ?? [];
  const total = att.length;
  const attended = att.filter((a: any) => a.status === "present" || a.status === "late").length;
  const rate = total ? Math.round((attended / total) * 100) : null;
  const scores = (assessments ?? []).map((a: any) => Number(a.overall_score)).filter((n) => !Number.isNaN(n));
  const avgScore = scores.length ? (scores.reduce((x, y) => x + y, 0) / scores.length).toFixed(1) : "—";
  const points = (ledger ?? []).reduce((x: number, r: any) => x + Number(r.points), 0);

  const inv = (invoices ?? []) as any[];
  const plan = inv.find((i) => i.fee_plans)?.fee_plans ?? null;
  const outstanding = inv
    .filter((i) => i.status === "unpaid" || i.status === "overdue")
    .reduce((s, i) => s + Number(i.amount), 0);
  const planCurrency = plan?.currency ?? inv[0]?.currency ?? "MYR";

  const subtitle = [
    age != null ? `Age ${age}` : null,
    cls?.level ?? null,
    cls?.name ?? null,
  ].filter(Boolean).join(" · ") || "No class enrolment yet";

  return (
    <div className="space-y-6">
      <Link href="/parent" className="inline-flex items-center text-sm text-slate-500 hover:text-slate-900">
        ← Back to dashboard
      </Link>

      <PageHeader
        title={student.full_name}
        description={subtitle}
        action={<Badge tone={student.status === "active" ? "green" : "slate"}>{student.status}</Badge>}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Attendance" value={rate != null ? `${rate}%` : "—"} sub={`${attended}/${total} sessions`} />
        <StatCard label="Avg skill score" value={avgScore} sub={`${scores.length} assessments`} />
        <StatCard label="Reward points" value={points} tone="green" />
        <StatCard
          label="Outstanding"
          value={outstanding > 0 ? formatCurrency(outstanding, planCurrency) : "RM 0"}
          tone={outstanding > 0 ? "red" : "green"}
        />
      </div>

      {/* ─── Package & fees ─────────────────────────────────────────────── */}
      <Section title="Package & Fees" flush>
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="text-sm text-slate-500">{plan?.name ?? "No package assigned"}</div>
            <div className="text-2xl font-bold text-green-700">
              {plan ? (
                <>
                  {formatCurrency(Number(plan.amount), plan.currency)}
                  <span className="text-sm font-medium text-slate-400">
                    {INTERVAL_SUFFIX[plan.interval as FeeInterval]}
                  </span>
                </>
              ) : (
                <span className="text-slate-400">—</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Outstanding</div>
            <div className={`text-2xl font-bold ${outstanding > 0 ? "text-red-600" : "text-green-700"}`}>
              {outstanding > 0 ? formatCurrency(outstanding, planCurrency) : "Paid up"}
            </div>
          </div>
        </div>

        {inv.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <Th>Invoice</Th><Th>Month</Th><Th>Fee</Th><Th>Due</Th>
                  <Th>Status</Th><Th className="text-right">Action</Th>
                </tr>
              </thead>
              <tbody>
                {inv.map((i) => (
                  <tr key={i.id}>
                    <Td className="font-mono text-xs text-slate-500">{i.invoice_no ?? "—"}</Td>
                    <Td>{i.period_month ? monthLabel(i.period_month) : "—"}</Td>
                    <Td className="font-medium text-slate-900">{formatCurrency(Number(i.amount), i.currency)}</Td>
                    <Td className="text-slate-500">{formatDate(i.due_date)}</Td>
                    <Td><Badge tone={INV_TONE[i.status as InvoiceStatus]}>{i.status}</Badge></Td>
                    <Td className="text-right">
                      {i.status !== "paid" && i.status !== "canceled" && i.status !== "refunded" ? (
                        <form action={payInvoice}>
                          <input type="hidden" name="id" value={i.id} />
                          <SubmitButton pendingText="Redirecting…" className="!px-3 !py-1.5">Pay now</SubmitButton>
                        </form>
                      ) : i.status === "paid" ? (
                        <span className="text-xs font-medium text-green-600">Paid</span>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState message="No invoices for this child yet." /></div>
        )}
      </Section>

      {/* ─── Attendance ─────────────────────────────────────────────────── */}
      <Section title="Attendance history" flush>
        {att.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><Th>Date</Th><Th>Class</Th><Th>Status</Th><Th>Tap in</Th></tr></thead>
              <tbody>
                {att.map((a: any, i) => (
                  <tr key={i}>
                    <Td>{formatDate(a.sessions?.session_date)}</Td>
                    <Td className="text-slate-500">{a.sessions?.classes?.name ?? "—"}</Td>
                    <Td><Badge tone={ATT_TONE[a.status as AttendanceStatus]}>{a.status}</Badge></Td>
                    <Td className="text-slate-500">{a.tap_in_at ? formatDateTime(a.tap_in_at) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState message="No attendance records yet." /></div>
        )}
      </Section>

      {/* ─── Progress ───────────────────────────────────────────────────── */}
      <Section title="Progress" flush>
        {assessments && assessments.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><Th>Date</Th><Th>Scheme</Th><Th>Score</Th><Th>Comment</Th></tr></thead>
              <tbody>
                {assessments.map((a: any, i) => (
                  <tr key={i}>
                    <Td>{formatDate(a.assessed_on)}</Td>
                    <Td className="text-slate-500">{a.marking_schemes?.name ?? "—"}</Td>
                    <Td><Badge tone="blue">{a.overall_score != null ? `${a.overall_score}%` : "—"}</Badge></Td>
                    <Td className="max-w-sm truncate text-slate-500" title={a.comment ?? ""}>{a.comment ?? "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5"><EmptyState message="No assessments yet." /></div>
        )}
      </Section>

      {/* ─── Rewards ────────────────────────────────────────────────────── */}
      {ledger && ledger.length > 0 && (
        <Section title="Rewards" flush>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr><Th>Date</Th><Th>Reason</Th><Th className="text-right">Points</Th></tr></thead>
              <tbody>
                {ledger.map((r: any, i) => (
                  <tr key={i}>
                    <Td>{formatDate(r.awarded_at)}</Td>
                    <Td className="text-slate-500">{r.reason ?? "—"}</Td>
                    <Td className="text-right font-semibold text-green-700">+{r.points}</Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      )}
    </div>
  );
}
