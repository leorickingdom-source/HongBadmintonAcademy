import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, LinkButton, Table, Th, Td, EmptyState, Badge,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ExamForm } from "@/components/exam-form";
import { SkillsChecklist } from "@/components/skills-checklist";
import { dict } from "@/lib/i18n";
import {
  nextExamWindow, DECISION_LABEL,
  getExamEligibility, EXAM_ATTENDANCE_MIN_PCT,
  type Decision,
} from "@/lib/training";
import { getExamSpecMerged, getLevelInfoMerged } from "@/lib/syllabus";

export const dynamic = "force-dynamic";

const BAND_TONE: Record<string, "green" | "blue" | "yellow" | "red" | "slate"> = {
  excellent: "green", pass: "blue", borderline: "yellow", fail: "red",
};

export default async function CoachExamGradePage({
  params,
  searchParams,
}: {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  const me = await requireRole("coach");
  const L = dict(me.locale);
  const { studentId } = await params;
  const { error, saved } = await searchParams;
  const supabase = await createClient();

  const { data: student } = await supabase
    .from("students")
    .select("id, full_name, level")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) notFound();

  const fromLevel = (student as any).level || 1;
  const [spec, fromInfo, toInfo, elig] = await Promise.all([
    getExamSpecMerged(fromLevel),
    getLevelInfoMerged(fromLevel),
    getLevelInfoMerged(fromLevel + 1),
    getExamEligibility(supabase, studentId),
  ]);
  const win = nextExamWindow();
  const fromName = fromInfo?.name ?? "—";
  const toName = toInfo?.name ?? "—";

  const { data: history } = await supabase
    .from("level_exams")
    .select("id, exam_date, from_level, to_level, total, band, decision, window_label, coach_comment")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(20);

  const { data: masteredRows } = await supabase
    .from("skill_mastery")
    .select("skill_key")
    .eq("student_id", studentId)
    .eq("level", fromLevel);
  const masteredKeys = ((masteredRows ?? []) as any[]).map((r) => r.skill_key as string);

  return (
    <div className="space-y-6">
      <LinkButton href="/coach/exams" variant="ghost" className="!px-0">← Back to students</LinkButton>

      <PageHeader
        title={student.full_name}
        description={
          spec?.review
            ? `Level ${fromLevel} Elite review · ${win.label}`
            : `Level ${fromLevel} → ${fromLevel + 1} assessment · ${win.label}`
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <span className="font-medium text-slate-800">Current: Level {fromLevel} · {fromName}</span>
        {spec && !spec.review && (
          <span className="text-slate-500">Target: Level {spec.toLevel} · {toName}</span>
        )}
        {spec?.review && <span className="text-purple-600">Elite review — confirms the student stays in the Elite Team.</span>}
      </div>

      {saved && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">Assessment saved. An admin will review + approve any promotion.</p>
      )}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className={`rounded-xl border p-3 text-sm shadow-sm ${elig.eligible ? "border-green-200 bg-green-50 text-green-800" : "border-amber-200 bg-amber-50 text-amber-800"}`}>
        <div className="font-medium">
          {elig.eligible ? "✓ Eligible for assessment" : "⚠ Not yet eligible for assessment"}
        </div>
        <div className="mt-0.5 text-xs">
          Attendance {elig.attendedPct != null ? `${elig.attendedPct}%` : "—"} · {elig.attended}/{elig.total} sessions in the last 90 days.
          {elig.reason ? ` ${elig.reason}` : ` Minimum ${EXAM_ATTENDANCE_MIN_PCT}%.`}
        </div>
      </div>

      {fromInfo && fromInfo.groups.length > 0 && (
        <Section title={L.skills_title} description={L.skills_hint}>
          <SkillsChecklist studentId={student.id} level={fromLevel} groups={fromInfo.groups} initial={masteredKeys} locale={me.locale} />
        </Section>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title={spec ? spec.title : "Assessment"} description="Score each item 0 to its max. Total and band update live.">
            {!spec ? (
              <EmptyState message="No assessment rubric defined for this level." />
            ) : !elig.eligible ? (
              <EmptyState message="Cannot assess until attendance reaches the minimum. Help the student get to class, then come back." />
            ) : (
              <ExamForm studentId={student.id} spec={spec} />
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Pass standard">
            <ul className="space-y-2 text-sm">
              <li className="flex items-center justify-between"><span className="text-slate-600">80–100</span><Badge tone="green">Excellent</Badge></li>
              <li className="flex items-center justify-between"><span className="text-slate-600">70–79</span><Badge tone="blue">Pass</Badge></li>
              <li className="flex items-center justify-between"><span className="text-slate-600">60–69</span><Badge tone="yellow">Borderline</Badge></li>
              <li className="flex items-center justify-between"><span className="text-slate-600">Below 60</span><Badge tone="red">Fail</Badge></li>
            </ul>
            <p className="mt-3 text-xs text-slate-500">≥ 70 recommends a promotion (an admin approves it). Borderline retests in 1–2 months.</p>
          </Section>
        </div>
      </div>

      <Section title="Assessment history" flush>
        {history && history.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Level</Th><Th>Score</Th><Th>Result</Th><Th>Decision</Th><Th>Comment</Th><Th>PDF</Th></tr>
            </thead>
            <tbody>
              {(history as any[]).map((h) => (
                <tr key={h.id} className="hover:bg-slate-50">
                  <Td>{formatDate(h.exam_date)}{h.window_label ? <span className="block text-xs text-slate-400">{h.window_label}</span> : null}</Td>
                  <Td>{h.from_level} → {h.to_level > 6 ? "Elite" : h.to_level}</Td>
                  <Td className="font-semibold tabular-nums">{h.total}/100</Td>
                  <Td><Badge tone={BAND_TONE[h.band] ?? "slate"}>{h.band ?? "—"}</Badge></Td>
                  <Td className="text-slate-600">{DECISION_LABEL[h.decision as Decision] ?? h.decision ?? "—"}</Td>
                  <Td className="max-w-xs truncate text-slate-500" title={h.coach_comment ?? ""}>{h.coach_comment ?? "—"}</Td>
                  <Td><a href={`/api/exams/${h.id}/pdf`} target="_blank" rel="noopener" className="text-green-700 hover:underline">PDF</a></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><EmptyState message="No assessments recorded for this student yet." /></div>
        )}
      </Section>
    </div>
  );
}
