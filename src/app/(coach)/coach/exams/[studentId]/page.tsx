import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, LinkButton, Table, Th, Td, EmptyState, Badge,
} from "@/components/ui";
import { formatDate } from "@/lib/format";
import { ExamForm } from "@/components/exam-form";
import { examSpecFor, levelName, nextExamWindow, DECISION_LABEL, type Decision } from "@/lib/training";

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
  await requireRole("coach");
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
  const spec = examSpecFor(fromLevel);
  const win = nextExamWindow();

  const { data: history } = await supabase
    .from("level_exams")
    .select("id, exam_date, from_level, to_level, total, band, decision, window_label, coach_comment")
    .eq("student_id", studentId)
    .order("created_at", { ascending: false })
    .limit(20);

  return (
    <div className="space-y-6">
      <LinkButton href="/coach/exams" variant="ghost" className="!px-0">← Back to students</LinkButton>

      <PageHeader
        title={student.full_name}
        description={
          spec?.review
            ? `Level ${fromLevel} Elite review · ${win.label}`
            : `Level ${fromLevel} → ${fromLevel + 1} promotion exam · ${win.label}`
        }
      />

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 text-sm shadow-sm">
        <span className="font-medium text-slate-800">Current: Level {fromLevel} · {levelName(fromLevel)}</span>
        {spec && !spec.review && (
          <span className="text-slate-500">Target: Level {spec.toLevel} · {levelName(spec.toLevel)}</span>
        )}
        {spec?.review && <span className="text-purple-600">Elite review — confirms the student stays in the Elite Team.</span>}
      </div>

      {saved && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">Exam result saved.</p>
      )}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Section title={spec ? spec.title : "Exam"} description="Score each item 0 to its max. Total and pass band update live.">
            {spec ? (
              <ExamForm studentId={student.id} spec={spec} />
            ) : (
              <EmptyState message="No exam rubric defined for this level." />
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
            <p className="mt-3 text-xs text-slate-500">≥ 70 promotes to the next level. Borderline retests in 1–2 months.</p>
          </Section>
        </div>
      </div>

      <Section title="Exam history" flush>
        {history && history.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Level</Th><Th>Score</Th><Th>Result</Th><Th>Decision</Th><Th>Comment</Th></tr>
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
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><EmptyState message="No exams recorded for this student yet." /></div>
        )}
      </Section>
    </div>
  );
}
