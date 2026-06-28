import "server-only";
import { cache } from "react";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  TRAINING_LEVELS, EXAM_SPECS,
  type TrainingLevel, type ExamSpec,
} from "@/lib/training";

// Admin can override the per-level *name* + *objective*, the per-exam-item
// *label*, AND the full item list per section (add/remove items + set each
// max). The 100-pt section caps (40/25/20/15) are fixed; a full item override is
// only honoured when its maxes sum exactly to the section cap. Old graded exams
// are unaffected — their scores jsonb is a self-describing snapshot.

export const LEVEL_OVERRIDE_KEY = "syllabus_levels";
export const EXAM_OVERRIDE_KEY = "syllabus_exam_items";
export const ITEMS_OVERRIDE_KEY = "syllabus_items";

export interface LevelOverride {
  level: number;        // 1–6
  name?: string;
  objective?: string;
}
export interface ExamItemOverride {
  fromLevel: number;    // which exam spec
  sectionKey: string;   // technical / footwork / tactical / physical
  index: number;        // 0-based item index within section
  label: string;
}
// Full item-list override for one (level, section). Honoured only when the maxes
// sum to the section cap.
export interface SectionItemsOverride {
  fromLevel: number;
  sectionKey: string;
  items: { label: string; max: number }[];
}

async function getValue<T>(key: string, fallback: T): Promise<T> {
  const db = createAdminClient();
  const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value ?? fallback) as T;
}
async function setValue(key: string, value: unknown): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

export const loadLevelOverrides = () => getValue<LevelOverride[]>(LEVEL_OVERRIDE_KEY, []);
export const saveLevelOverrides = (rows: LevelOverride[]) => setValue(LEVEL_OVERRIDE_KEY, rows);
export const loadExamItemOverrides = () => getValue<ExamItemOverride[]>(EXAM_OVERRIDE_KEY, []);
export const saveExamItemOverrides = (rows: ExamItemOverride[]) => setValue(EXAM_OVERRIDE_KEY, rows);
export const loadSectionItemOverrides = () => getValue<SectionItemsOverride[]>(ITEMS_OVERRIDE_KEY, []);
export const saveSectionItemOverrides = (rows: SectionItemsOverride[]) => setValue(ITEMS_OVERRIDE_KEY, rows);

// Merged syllabus: defaults from training.ts overlaid with any admin overrides.
// `cache()` deduplicates the two DB reads within one server request. Each call
// returns NEW arrays so callers can safely mutate / sort.
export const loadSyllabus = cache(async (): Promise<{ levels: TrainingLevel[]; exams: ExamSpec[] }> => {
  const [levelOverrides, examOverrides, itemOverrides] = await Promise.all([
    loadLevelOverrides(),
    loadExamItemOverrides(),
    loadSectionItemOverrides(),
  ]);
  const lvByNum = new Map<number, LevelOverride>(
    (levelOverrides ?? []).map((o) => [Number(o.level), o]),
  );
  const levels: TrainingLevel[] = TRAINING_LEVELS.map((lv) => {
    const o = lvByNum.get(lv.level);
    return {
      ...lv,
      name: o?.name?.trim() || lv.name,
      objective: o?.objective?.trim() || lv.objective,
      groups: lv.groups.map((g) => ({ ...g, items: [...g.items] })),
    };
  });

  // Bucket per-index label overrides + full section-item overrides.
  const exKey = (fl: number, sk: string, i: number) => `${fl}|${sk}|${i}`;
  const exMap = new Map<string, ExamItemOverride>(
    (examOverrides ?? []).map((o) => [exKey(Number(o.fromLevel), String(o.sectionKey), Number(o.index)), o]),
  );
  const secKey = (fl: number, sk: string) => `${fl}|${sk}`;
  const itemMap = new Map<string, { label: string; max: number }[]>();
  for (const o of itemOverrides ?? []) {
    const items = (o.items ?? []).map((it) => ({ label: String(it.label).trim(), max: Number(it.max) }))
      .filter((it) => it.label && Number.isFinite(it.max) && it.max > 0);
    if (items.length) itemMap.set(secKey(Number(o.fromLevel), String(o.sectionKey)), items);
  }

  const exams: ExamSpec[] = EXAM_SPECS.map((spec) => ({
    ...spec,
    sections: spec.sections.map((sec) => {
      // Full item-list override wins, but only if its maxes sum to the cap.
      const ov = itemMap.get(secKey(spec.fromLevel, sec.key));
      if (ov && ov.reduce((s, it) => s + it.max, 0) === sec.max) {
        return { ...sec, items: ov.map((it) => ({ label: it.label, max: it.max })) };
      }
      // Otherwise default items with per-index label overrides applied.
      return {
        ...sec,
        items: sec.items.map((it, i) => {
          const o = exMap.get(exKey(spec.fromLevel, sec.key, i));
          return { ...it, label: o?.label?.trim() || it.label };
        }),
      };
    }),
  }));

  return { levels, exams };
});

// Convenience: just one slice when the caller only needs the level info.
export async function getLevelsMerged(): Promise<TrainingLevel[]> {
  return (await loadSyllabus()).levels;
}
export async function getExamSpecMerged(fromLevel: number): Promise<ExamSpec | null> {
  const exams = (await loadSyllabus()).exams;
  return exams.find((e) => e.fromLevel === fromLevel) ?? null;
}
export async function getLevelInfoMerged(level: number | null | undefined) {
  if (!level) return null;
  return (await loadSyllabus()).levels.find((l) => l.level === level) ?? null;
}
