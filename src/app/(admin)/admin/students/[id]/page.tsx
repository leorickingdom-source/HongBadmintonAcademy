import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, StatCard, Table, Th, Td, Badge, EmptyState,
  LinkButton, Field, Input, Select, Button, cn,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatDateTime, formatCurrency } from "@/lib/format";
import { levelBadgeClass } from "@/lib/training";
import { getLevelInfoMerged } from "@/lib/syllabus";
import type { AttendanceStatus, InvoiceStatus } from "@/lib/types";
import { awardReward, promoteStudent } from "../actions";

export const dynamic = "force-dynamic";

const ATT_TONE: Record<AttendanceStatus, "green" | "yellow" | "red" | "slate"> = {
  present: "green", late: "yellow", absent: "red", excused: "slate",
};
const INV_TONE: Record<InvoiceStatus, "green" | "yellow" | "red" | "slate"> = {
  draft: "slate", unpaid: "yellow", paid: "green", overdue: "red", canceled: "slate", refunded: "slate",
};

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("*, parent:profiles!students_parent_id_fkey(full_name, phone)")
    .eq("id", id)
    .maybeSingle();
  if (!student) notFound();

  const [
    { data: attendance },
    { data: exams },
    { data: ledger },
    { data: rules },
    { data: invoices },
    { data: enrollments },
  ] = await Promise.all([
    supabase
      .from("attendance")
      .select("status, tap_in_at, tap_out_at, sessions(session_date, classes(name))")
      .eq("student_id", id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("level_exams")
      .select("id, exam_date, from_level, to_level, total, band, decision, coach_comment")
      .eq("student_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("reward_ledger")
      .select("points, reason, awarded_at, reward_rules(name)")
      .eq("student_id", id)
      .order("awarded_at", { ascending: false }),
    supabase.from("reward_rules").select("id, name, points").eq("is_active", true).order("name"),
    supabase
      .from("invoices")
      .select("invoice_no, amount, currency, status, due_date")
      .eq("student_id", id)
      .order("created_at", { ascending: false }),
    supabase.from("enrollments").select("classes(name, level)").eq("student_id", id).eq("active", true),
  ]);

  const att = attendance ?? [];
  const total = att.length;
  const attended = att.filter((a: any) => a.status === "present" || a.status === "late").length;
  const rate = total ? Math.round((attended / total) * 100) : null;

  const lastExam = (exams ?? [])[0] ?? null;

  const totalPoints = (ledger ?? []).reduce((x: number, r: any) => x + Number(r.points), 0);
  const classNames = (enrollments ?? []).map((e: any) => e.classes?.name).filter(Boolean).join(", ");
  const curLevel: number = Number((student as any).level ?? 1);
  const curLevelName = (await getLevelInfoMerged(curLevel))?.name ?? "—";

  return (
    <div className="space-y-6">
      <PageHeader
        title={student.full_name}
        description={
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge tone={student.status === "active" ? "green" : "slate"}>{student.status}</Badge>
              {classNames && <span>{classNames}</span>}
            </div>
            {student.parent?.full_name && <div>Parent: {student.parent.full_name}</div>}
          </div>
        }
        action={
          <>
            <LinkButton href={`/admin/students/${id}/edit`} variant="secondary">Edit</LinkButton>
            <LinkButton href="/admin/students" variant="ghost">← All students</LinkButton>
          </>
        }
      />
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Attendance rate" value={rate != null ? `${rate}%` : "—"} sub={`${attended}/${total} sessions`} tone="blue" />
        <StatCard label="Last exam" value={lastExam ? `${lastExam.total}/100` : "—"} sub={lastExam ? lastExam.band : `${(exams ?? []).length} exams`} />
        <StatCard label="Reward points" value={totalPoints} tone="green" />
        <StatCard label="NFC tag" value={student.nfc_tag_uid ? "✓" : "—"} sub={student.nfc_tag_uid ?? "unbound"} />
      </div>

      {/* Training level (read-only). Promotion is one-way: this button bumps the
       *  level by +1 (max 6). Coaches normally promote via a graded /coach/exams. */}
      <Section title="Training level">
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex rounded-full px-3 py-1 text-sm font-semibold", levelBadgeClass(curLevel))}>
            L{curLevel} · {curLevelName}
          </span>
          <span className="text-xs text-slate-400">
            Set by promotion exams (Jan / Apr / Jul / Oct) or the button here.
          </span>
          <form action={promoteStudent}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton pendingText="Promoting…" {...(curLevel >= 6 ? { disabled: true } : {})}>
              ⬆ Promote to L{Math.min(6, curLevel + 1)}
            </SubmitButton>
          </form>
        </div>
      </Section>

      {/* Attendance history */}
      <Section title="Attendance history" flush>
        {att.length ? (
          <>
            <Table>
              <thead><tr><Th>Date</Th><Th>Class</Th><Th>Status</Th><Th>Tap in</Th><Th>Tap out</Th></tr></thead>
              <tbody>
                {att.slice(0, 3).map((a: any, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td>{formatDate(a.sessions?.session_date)}</Td>
                    <Td className="text-slate-500">{a.sessions?.classes?.name ?? "—"}</Td>
                    <Td><Badge tone={ATT_TONE[a.status as AttendanceStatus]}>{a.status}</Badge></Td>
                    <Td className="text-slate-500">{a.tap_in_at ? formatDateTime(a.tap_in_at) : "—"}</Td>
                    <Td className="text-slate-500">{a.tap_out_at ? formatDateTime(a.tap_out_at) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {att.length > 3 && (
              <details className="border-t border-slate-100">
                <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-green-700 hover:bg-slate-50">
                  Show {att.length - 3} earlier sessions
                </summary>
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-sm">
                    <tbody>
                      {att.slice(3).map((a: any, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <Td>{formatDate(a.sessions?.session_date)}</Td>
                          <Td className="text-slate-500">{a.sessions?.classes?.name ?? "—"}</Td>
                          <Td><Badge tone={ATT_TONE[a.status as AttendanceStatus]}>{a.status}</Badge></Td>
                          <Td className="text-slate-500">{a.tap_in_at ? formatDateTime(a.tap_in_at) : "—"}</Td>
                          <Td className="text-slate-500">{a.tap_out_at ? formatDateTime(a.tap_out_at) : "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        ) : <div className="p-5"><EmptyState message="No attendance records yet." /></div>}
      </Section>

      {/* Promotion exams */}
      <Section title="Promotion exams" flush>
        {exams && exams.length ? (
          <Table>
            <thead><tr><Th>Date</Th><Th>Level</Th><Th>Score</Th><Th>Result</Th><Th>PDF</Th></tr></thead>
            <tbody>
              {exams.map((e: any) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td>{formatDate(e.exam_date)}</Td>
                  <Td>{e.from_level} → {e.to_level > 6 ? "Elite" : e.to_level}</Td>
                  <Td className="font-semibold tabular-nums">{e.total}/100</Td>
                  <Td><Badge tone={e.band === "excellent" || e.band === "pass" ? "green" : e.band === "borderline" ? "yellow" : "red"}>{e.band ?? "—"}</Badge></Td>
                  <Td><a href={`/api/exams/${e.id}/pdf`} target="_blank" rel="noopener" className="text-green-700 hover:underline">PDF</a></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState message="No promotion exams yet." /></div>}
      </Section>

      {/* Rewards */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title="Rewards ledger" flush>
            {ledger && ledger.length ? (
              <Table>
                <thead><tr><Th>Date</Th><Th>Rule</Th><Th>Reason</Th><Th className="text-right">Points</Th></tr></thead>
                <tbody>
                  {ledger.map((r: any, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <Td>{formatDate(r.awarded_at)}</Td>
                      <Td className="text-slate-500">{r.reward_rules?.name ?? "—"}</Td>
                      <Td className="text-slate-500">{r.reason ?? "—"}</Td>
                      <Td className="text-right font-semibold text-green-700">+{r.points}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <div className="p-5"><EmptyState message="No rewards awarded yet." /></div>}
          </Section>
        </div>
        <Section title="Award points">
          <form action={awardReward} className="space-y-3">
            <input type="hidden" name="student_id" value={id} />
            <Field label="Rule (optional)">
              <Select name="rule_id" defaultValue="">
                <option value="">— custom —</option>
                {(rules ?? []).map((r: any) => (
                  <option key={r.id} value={r.id}>{r.name} (+{r.points})</option>
                ))}
              </Select>
            </Field>
            <Field label="Points">
              <Input type="number" name="points" defaultValue={10} required />
            </Field>
            <Field label="Reason">
              <Input name="reason" placeholder="e.g. Perfect attendance" />
            </Field>
            <SubmitButton className="w-full" pendingText="Awarding…">Award</SubmitButton>
          </form>
        </Section>
      </div>

      {/* Invoices */}
      <Section title="Fees" flush>
        {invoices && invoices.length ? (
          <Table>
            <thead><tr><Th>Invoice</Th><Th>Amount</Th><Th>Due</Th><Th>Status</Th></tr></thead>
            <tbody>
              {invoices.map((inv: any, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs text-slate-500">{inv.invoice_no ?? "—"}</Td>
                  <Td className="font-medium text-slate-900">{formatCurrency(Number(inv.amount), inv.currency)}</Td>
                  <Td className="text-slate-500">{formatDate(inv.due_date)}</Td>
                  <Td><Badge tone={INV_TONE[inv.status as InvoiceStatus]}>{inv.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState message="No invoices yet." /></div>}
      </Section>
    </div>
  );
}
