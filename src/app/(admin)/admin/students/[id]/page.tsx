import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import {
  PageHeader, Section, StatCard, Table, Th, Td, Badge, EmptyState,
  LinkButton, Field, Input, Select, Button, cn,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatDateTime, formatCurrency, monthLabel } from "@/lib/format";
import { levelBadgeClass } from "@/lib/training";
import { getLevelInfoMerged } from "@/lib/syllabus";
import { dict } from "@/lib/i18n";
import type { AttendanceStatus, InvoiceStatus } from "@/lib/types";
import type { ReactNode } from "react";
import { awardReward, promoteStudent } from "../actions";

export const dynamic = "force-dynamic";

const ATT_TONE: Record<AttendanceStatus, "green" | "yellow" | "red" | "slate"> = {
  present: "green", late: "yellow", absent: "red", excused: "slate",
};
const INV_TONE: Record<InvoiceStatus, "green" | "yellow" | "red" | "slate"> = {
  draft: "slate", unpaid: "yellow", paid: "green", overdue: "red", canceled: "slate", refunded: "slate",
};

// Collapsible card matching Section's chrome — the secondary history blocks on a
// student profile are dense, so they fold away (native <details>, no client JS;
// forms inside still post). `count` shows in the header so you can gauge a
// section without opening it; the most-used one (attendance) starts open.
function Collapsible({
  title, count, defaultOpen, children,
}: { title: string; count?: number; defaultOpen?: boolean; children: ReactNode }) {
  return (
    <details open={defaultOpen} className="group rounded-xl border border-slate-200 bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-3.5 [&::-webkit-details-marker]:hidden">
        <h2 className="text-sm font-semibold text-slate-900">
          {title}
          {count != null && <span className="ml-2 text-xs font-normal text-slate-400">{count}</span>}
        </h2>
        <svg viewBox="0 0 12 12" className="h-3.5 w-3.5 shrink-0 text-slate-400 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M4.5 2.5 8 6l-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className="border-t border-slate-100">{children}</div>
    </details>
  );
}

export default async function StudentProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const attLabel: Record<string, string> = {
    present: L.att_present, late: L.att_late, absent: L.att_absent, excused: L.att_excused,
  };
  const invLabel: Record<string, string> = {
    draft: L.inv_st_draft, unpaid: L.inv_st_unpaid, paid: L.inv_st_paid,
    overdue: L.inv_st_overdue, canceled: L.inv_st_canceled, refunded: L.inv_st_refunded,
  };
  const bandLabel: Record<string, string> = {
    excellent: L.ex_band_excellent, pass: L.ex_band_pass, borderline: L.ex_band_borderline, fail: L.ex_band_fail,
  };
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("*, parent:profiles!students_parent_id_fkey(full_name, phone), assigned_coach:profiles!students_coach_id_fkey(full_name)")
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

  const { data: monthly } = await supabase
    .from("monthly_assessments")
    .select("period_month, fitness, skills, attitude, comment, coach:profiles!monthly_assessments_coach_id_fkey(full_name)")
    .eq("student_id", id)
    .order("period_month", { ascending: false })
    .limit(3);

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
              <Badge tone={student.status === "active" ? "green" : "slate"}>{student.status === "active" ? L.adm_active : L.adm_inactive}</Badge>
              {student.nickname && <span className="text-slate-500">“{student.nickname}”</span>}
              {classNames && <span>{classNames}</span>}
            </div>
            {student.parent?.full_name && <div>{L.inv_parent}: {student.parent.full_name}</div>}
            {student.assigned_coach?.full_name && <div>{L.adm_coach}: {student.assigned_coach.full_name}</div>}
          </div>
        }
        action={
          <>
            <LinkButton href={`/admin/students/${id}/edit`} variant="secondary">{L.edit_btn}</LinkButton>
            <LinkButton href="/admin/students" variant="ghost">{L.sd_all}</LinkButton>
          </>
        }
      />
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label={L.ana_att_rate} value={rate != null ? `${rate}%` : "—"} sub={`${attended}/${total} ${L.sd_sessions_w}`} tone="blue" />
        <StatCard label={L.sd_last_exam} value={lastExam ? `${lastExam.total}/100` : "—"} sub={lastExam ? (bandLabel[lastExam.band] ?? lastExam.band) : `${(exams ?? []).length} ${L.sd_exams_w}`} />
        <StatCard label={L.sd_reward_points} value={totalPoints} tone="green" />
        <StatCard label={L.sd_nfc_tag} value={student.nfc_tag_uid ? "✓" : "—"} sub={student.nfc_tag_uid ?? L.sd_unbound} />
      </div>

      {/* Training level (read-only). Promotion is one-way: this button bumps the
       *  level by +1 (max 6). Coaches normally promote via a graded /coach/exams. */}
      <Section title={L.training_level}>
        <div className="flex flex-wrap items-center gap-3">
          <span className={cn("inline-flex rounded-full px-3 py-1 text-sm font-semibold", levelBadgeClass(curLevel))}>
            L{curLevel} · {curLevelName}
          </span>
          <span className="text-xs text-slate-400">
            {L.sd_level_hint}
          </span>
          <form action={promoteStudent}>
            <input type="hidden" name="id" value={id} />
            <SubmitButton pendingText={L.ex_promoting} {...(curLevel >= 6 ? { disabled: true } : {})}>
              ⬆ {L.ex_promote_to}L{Math.min(6, curLevel + 1)}
            </SubmitButton>
          </form>
        </div>
      </Section>

      {/* Attendance history */}
      <Collapsible title={L.sd_att_history} count={att.length} defaultOpen>
        {att.length ? (
          <>
            <Table>
              <thead><tr><Th>{L.col_date}</Th><Th>{L.class_word}</Th><Th>{L.col_status}</Th><Th>{L.sd_tap_in}</Th><Th>{L.sd_tap_out}</Th></tr></thead>
              <tbody>
                {att.slice(0, 3).map((a: any, i) => (
                  <tr key={i} className="hover:bg-slate-50">
                    <Td>{formatDate(a.sessions?.session_date)}</Td>
                    <Td label={L.class_word} className="text-slate-500">{a.sessions?.classes?.name ?? "—"}</Td>
                    <Td label={L.col_status}><Badge tone={ATT_TONE[a.status as AttendanceStatus]}>{attLabel[a.status] ?? a.status}</Badge></Td>
                    <Td label={L.sd_tap_in} className="text-slate-500">{a.tap_in_at ? formatDateTime(a.tap_in_at) : "—"}</Td>
                    <Td label={L.sd_tap_out} className="text-slate-500">{a.tap_out_at ? formatDateTime(a.tap_out_at) : "—"}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            {att.length > 3 && (
              <details className="border-t border-slate-100">
                <summary className="cursor-pointer px-5 py-3 text-sm font-medium text-green-700 hover:bg-slate-50">
                  {L.sd_show_earlier.replace("{n}", String(att.length - 3))}
                </summary>
                <div className="overflow-x-auto border-t border-slate-100">
                  <table className="w-full text-sm">
                    <tbody>
                      {att.slice(3).map((a: any, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <Td>{formatDate(a.sessions?.session_date)}</Td>
                          <Td label={L.class_word} className="text-slate-500">{a.sessions?.classes?.name ?? "—"}</Td>
                          <Td label={L.col_status}><Badge tone={ATT_TONE[a.status as AttendanceStatus]}>{attLabel[a.status] ?? a.status}</Badge></Td>
                          <Td label="Tap in" className="text-slate-500">{a.tap_in_at ? formatDateTime(a.tap_in_at) : "—"}</Td>
                          <Td label="Tap out" className="text-slate-500">{a.tap_out_at ? formatDateTime(a.tap_out_at) : "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </details>
            )}
          </>
        ) : <div className="p-5"><EmptyState message={L.sd_no_att} /></div>}
      </Collapsible>

      {/* Promotion exams */}
      <Collapsible title={L.sd_promo_exams} count={(exams ?? []).length}>
        {exams && exams.length ? (
          <Table>
            <thead><tr><Th>{L.col_date}</Th><Th>{L.level_word}</Th><Th>{L.ex_score}</Th><Th>{L.ex_result}</Th><Th>PDF</Th></tr></thead>
            <tbody>
              {exams.map((e: any) => (
                <tr key={e.id} className="hover:bg-slate-50">
                  <Td>{formatDate(e.exam_date)}</Td>
                  <Td label={L.level_word}>{e.from_level} → {e.to_level > 6 ? L.ex_elite_word : e.to_level}</Td>
                  <Td label={L.ex_score} className="font-semibold tabular-nums">{e.total}/100</Td>
                  <Td label={L.ex_result}><Badge tone={e.band === "excellent" || e.band === "pass" ? "green" : e.band === "borderline" ? "yellow" : "red"}>{e.band ? (bandLabel[e.band] ?? e.band) : "—"}</Badge></Td>
                  <Td label="PDF"><a href={`/api/exams/${e.id}/pdf`} target="_blank" rel="noopener" className="text-green-700 hover:underline">PDF</a></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState message={L.sd_no_exams} /></div>}
      </Collapsible>

      {/* Monthly marks (coach's 1–5 monthly assessment — the parent report source) */}
      <Collapsible title={L.sd_monthly} count={(monthly ?? []).length}>
        {monthly && monthly.length ? (
          <Table>
            <thead><tr><Th>{L.sd_month}</Th><Th>{L.fitness}</Th><Th>{L.skills}</Th><Th>{L.attitude}</Th><Th>{L.sd_comment}</Th><Th>{L.adm_coach}</Th></tr></thead>
            <tbody>
              {monthly.map((m: any, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{monthLabel(m.period_month)}</Td>
                  <Td label={L.fitness} className="tabular-nums">{m.fitness ?? "—"}/5</Td>
                  <Td label={L.skills} className="tabular-nums">{m.skills ?? "—"}/5</Td>
                  <Td label={L.attitude} className="tabular-nums">{m.attitude ?? "—"}/5</Td>
                  <Td label={L.sd_comment} className="max-w-xs truncate text-slate-500">{m.comment ?? "—"}</Td>
                  <Td label={L.adm_coach} className="text-slate-500">{m.coach?.full_name ?? "—"}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState message={L.sd_no_monthly} /></div>}
      </Collapsible>

      {/* Rewards */}
      <Collapsible title={L.sd_rewards_ledger} count={(ledger ?? []).length}>
        <div className="grid gap-6 p-5 lg:grid-cols-3">
          <div className="lg:col-span-2">
            {ledger && ledger.length ? (
              <Table>
                <thead><tr><Th>{L.col_date}</Th><Th>{L.sd_rule}</Th><Th>{L.sd_reason}</Th><Th className="text-right">{L.rw_points}</Th></tr></thead>
                <tbody>
                  {ledger.map((r: any, i) => (
                    <tr key={i} className="hover:bg-slate-50">
                      <Td>{formatDate(r.awarded_at)}</Td>
                      <Td label={L.sd_rule} className="text-slate-500">{r.reward_rules?.name ?? "—"}</Td>
                      <Td label={L.sd_reason} className="text-slate-500">{r.reason ?? "—"}</Td>
                      <Td label={L.rw_points} className="text-right font-semibold text-green-700">+{r.points}</Td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            ) : <EmptyState message={L.sd_no_rewards} />}
          </div>
          <div>
            <h3 className="mb-3 text-sm font-semibold text-slate-900">{L.sd_award}</h3>
            <form action={awardReward} className="space-y-3">
              <input type="hidden" name="student_id" value={id} />
              <Field label={L.sd_rule_optional}>
                <Select name="rule_id" defaultValue="">
                  <option value="">{L.sd_custom}</option>
                  {(rules ?? []).map((r: any) => (
                    <option key={r.id} value={r.id}>{r.name} (+{r.points})</option>
                  ))}
                </Select>
              </Field>
              <Field label={L.rw_points}>
                <Input type="number" name="points" defaultValue={10} required />
              </Field>
              <Field label={L.sd_reason}>
                <Input name="reason" placeholder="e.g. Perfect attendance" />
              </Field>
              <SubmitButton className="w-full" pendingText={L.sd_awarding}>{L.sd_award_btn}</SubmitButton>
            </form>
          </div>
        </div>
      </Collapsible>

      {/* Invoices */}
      <Collapsible title={L.sd_fees} count={(invoices ?? []).length}>
        {invoices && invoices.length ? (
          <Table>
            <thead><tr><Th>{L.inv_invoice}</Th><Th>{L.fp_amount}</Th><Th>{L.inv_due}</Th><Th>{L.col_status}</Th></tr></thead>
            <tbody>
              {invoices.map((inv: any, i) => (
                <tr key={i} className="hover:bg-slate-50">
                  <Td className="font-mono text-xs text-slate-500">{inv.invoice_no ?? "—"}</Td>
                  <Td label={L.fp_amount} className="font-medium text-slate-900">{formatCurrency(Number(inv.amount), inv.currency)}</Td>
                  <Td label={L.inv_due} className="text-slate-500">{formatDate(inv.due_date)}</Td>
                  <Td label={L.col_status}><Badge tone={INV_TONE[inv.status as InvoiceStatus]}>{invLabel[inv.status] ?? inv.status}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : <div className="p-5"><EmptyState message={L.inv_empty} /></div>}
      </Collapsible>
    </div>
  );
}
