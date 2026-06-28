import { requireRole } from "@/lib/auth";
import {
  PageHeader, Section, Field, Input, Button, cn,
} from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { TrainingSyllabus } from "@/components/training-syllabus";
import { ExamItemsEditor } from "@/components/exam-items-editor";
import { TRAINING_LEVELS, levelActiveClass, levelInkClass } from "@/lib/training";
import { loadSyllabus } from "@/lib/syllabus";
import { saveLevelEdits, resetSyllabusOverrides } from "./actions";

export const dynamic = "force-dynamic";

export default async function AdminTrainingPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; saved?: string }>;
}) {
  await requireRole("admin");
  const { error, saved } = await searchParams;
  const { levels: mergedLevels, exams: mergedExams } = await loadSyllabus();

  // Build current-effective values keyed for easy form lookup. Use the merged
  // version as defaultValue so the input reflects any active override.
  const levelByNum = new Map(mergedLevels.map((l) => [l.level, l]));
  // Trimmed shape for the (client) item editor — no guidance fields.
  const editorExams = mergedExams.map((e) => ({
    fromLevel: e.fromLevel,
    toLevel: e.toLevel,
    title: e.title,
    review: e.review,
    sections: e.sections.map((s) => ({ key: s.key, label: s.label, max: s.max, items: s.items.map((it) => ({ label: it.label, max: it.max })) })),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Training syllabus"
        description="The HBA 6-level curriculum and promotion-exam rubric. Edits below override the built-in defaults; clear a field to revert."
        action={
          <form action={resetSyllabusOverrides}>
            <ConfirmButton label="Reset all overrides" confirmText="Revert every level name, objective and exam-item label back to the built-in defaults?" />
          </form>
        }
      />

      {saved && <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">Saved.</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <Section title="Edit level names + objectives" description="Item maxes and the 100-point rubric are locked (changing them would invalidate score history). Curriculum lists also stay code-managed for now — edit src/lib/training.ts to change them.">
        <form action={saveLevelEdits} className="space-y-4">
          {TRAINING_LEVELS.map((lv) => {
            const m = levelByNum.get(lv.level);
            return (
              <div key={lv.level} className="rounded-xl border border-slate-200 p-4">
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold", levelActiveClass(lv.level))}>{lv.level}</span>
                  <span className={cn("text-sm font-semibold", levelInkClass(lv.level))}>Level {lv.level}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Name" hint={`Default: ${lv.name}`}>
                    <Input name={`name_${lv.level}`} defaultValue={m?.name ?? lv.name} placeholder={lv.name} />
                  </Field>
                  <Field label="Objective" hint={`Default: ${lv.objective}`}>
                    <Input name={`obj_${lv.level}`} defaultValue={m?.objective ?? lv.objective} placeholder={lv.objective} />
                  </Field>
                </div>
              </div>
            );
          })}
          <Button type="submit">Save levels</Button>
        </form>
      </Section>

      <Section title="Edit exam items" description="Add, remove, rename or re-mark the items coaches grade. Each section must still total its fixed cap (40 / 25 / 20 / 15).">
        <ExamItemsEditor exams={editorExams} />
      </Section>

      <Section title="Current (merged) syllabus" description="What students, parents and coaches see after your overrides.">
        <TrainingSyllabus levels={mergedLevels} exams={mergedExams} />
      </Section>
    </div>
  );
}
