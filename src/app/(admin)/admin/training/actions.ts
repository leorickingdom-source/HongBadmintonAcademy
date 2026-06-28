"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import {
  loadLevelOverrides, saveLevelOverrides,
  loadExamItemOverrides, saveExamItemOverrides,
  saveSectionItemOverrides,
  type LevelOverride, type ExamItemOverride, type SectionItemsOverride,
} from "@/lib/syllabus";
import { TRAINING_LEVELS, EXAM_SPECS } from "@/lib/training";

function back(message?: string): never {
  redirect(message ? `/admin/training?error=${encodeURIComponent(message)}` : "/admin/training?saved=1");
}

// Save every per-level override in one shot. An empty string clears that field
// (loadSyllabus then falls back to the hardcoded default).
export async function saveLevelEdits(formData: FormData) {
  await requireRole("admin");
  const rows: LevelOverride[] = [];
  for (const lv of TRAINING_LEVELS) {
    const name = (formData.get(`name_${lv.level}`) as string)?.trim() ?? "";
    const objective = (formData.get(`obj_${lv.level}`) as string)?.trim() ?? "";
    // Only keep an override row if it actually differs from the default; that
    // way clearing the field reverts cleanly instead of pinning the default.
    if ((name && name !== lv.name) || (objective && objective !== lv.objective)) {
      rows.push({
        level: lv.level,
        name: name && name !== lv.name ? name : undefined,
        objective: objective && objective !== lv.objective ? objective : undefined,
      });
    }
  }
  try {
    await saveLevelOverrides(rows);
  } catch (e) {
    back((e as Error).message);
  }
  revalidatePath("/admin/training");
  back();
}

// Save every per-exam-item label override in one shot. Item maxes stay locked
// (changing them would invalidate score history).
export async function saveExamLabelEdits(formData: FormData) {
  await requireRole("admin");
  const rows: ExamItemOverride[] = [];
  for (const spec of EXAM_SPECS) {
    for (const sec of spec.sections) {
      sec.items.forEach((it, i) => {
        const field = `ex_${spec.fromLevel}_${sec.key}_${i}`;
        const label = (formData.get(field) as string)?.trim() ?? "";
        if (label && label !== it.label) {
          rows.push({ fromLevel: spec.fromLevel, sectionKey: sec.key, index: i, label });
        }
      });
    }
  }
  try {
    await saveExamItemOverrides(rows);
  } catch (e) {
    back((e as Error).message);
  }
  revalidatePath("/admin/training");
  back();
}

// Full add/remove/reorder of exam items per section. The client sends the whole
// intended state as JSON; we validate each section's maxes sum to its fixed cap
// (40/25/20/15) and store only the sections that differ from the built-in
// defaults (so a section edited back to default reverts cleanly).
export async function saveExamItems(formData: FormData) {
  await requireRole("admin");
  let payload: { fromLevel: number; sectionKey: string; items: { label: string; max: number }[] }[];
  try {
    payload = JSON.parse(String(formData.get("payload") ?? "[]"));
  } catch {
    back("Could not read the items.");
  }

  const defBySec = new Map<string, { cap: number; items: { label: string; max: number }[] }>();
  for (const spec of EXAM_SPECS) {
    for (const sec of spec.sections) {
      defBySec.set(`${spec.fromLevel}|${sec.key}`, { cap: sec.max, items: sec.items.map((it) => ({ label: it.label, max: it.max })) });
    }
  }

  const rows: SectionItemsOverride[] = [];
  for (const p of payload) {
    const def = defBySec.get(`${p.fromLevel}|${p.sectionKey}`);
    if (!def) continue;
    const items = (p.items ?? [])
      .map((it) => ({ label: String(it.label ?? "").trim(), max: Math.round(Number(it.max)) }))
      .filter((it) => it.label);
    if (!items.length) back(`Level ${p.fromLevel} · ${p.sectionKey}: needs at least one item.`);
    if (items.some((it) => !Number.isFinite(it.max) || it.max <= 0)) back(`Level ${p.fromLevel} · ${p.sectionKey}: every item needs a mark above 0.`);
    const sum = items.reduce((s, it) => s + it.max, 0);
    if (sum !== def.cap) back(`Level ${p.fromLevel} · ${p.sectionKey}: marks total ${sum}, must be ${def.cap}.`);
    const same = items.length === def.items.length && items.every((it, i) => it.label === def.items[i].label && it.max === def.items[i].max);
    if (!same) rows.push({ fromLevel: p.fromLevel, sectionKey: p.sectionKey, items });
  }

  try {
    await saveSectionItemOverrides(rows);
  } catch (e) {
    back((e as Error).message);
  }
  revalidatePath("/admin/training");
  back();
}

export async function resetSyllabusOverrides() {
  await requireRole("admin");
  try {
    await saveLevelOverrides([]);
    await saveExamItemOverrides([]);
    await saveSectionItemOverrides([]);
  } catch (e) {
    back((e as Error).message);
  }
  revalidatePath("/admin/training");
  back();
}

// Read-only helpers for the editor page (kept here so the page is a pure RSC).
export async function loadEditorState() {
  await requireRole("admin");
  const [levels, items] = await Promise.all([loadLevelOverrides(), loadExamItemOverrides()]);
  return { levelOverrides: levels, examOverrides: items };
}
