"use client";

import { useMemo, useState } from "react";
import { buttonClass, cn } from "@/components/ui";
import { saveExamItems } from "@/app/(admin)/admin/training/actions";

type Item = { label: string; max: number };
type Sec = { key: string; label: string; max: number; items: Item[] };
type Exam = { fromLevel: number; title: string; review?: boolean; toLevel: number; sections: Sec[] };

// Full add / remove / rename / re-mark of exam items per section. Each section's
// marks must total its fixed cap (40 / 25 / 20 / 15) before it can be saved.
export function ExamItemsEditor({ exams }: { exams: Exam[] }) {
  const [state, setState] = useState<Record<string, Item[]>>(() => {
    const m: Record<string, Item[]> = {};
    for (const e of exams) for (const s of e.sections) m[`${e.fromLevel}:${s.key}`] = s.items.map((it) => ({ ...it }));
    return m;
  });

  const setItems = (k: string, items: Item[]) => setState((s) => ({ ...s, [k]: items }));
  const upd = (k: string, i: number, patch: Partial<Item>) => setItems(k, state[k].map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  const add = (k: string) => setItems(k, [...state[k], { label: "", max: 0 }]);
  const remove = (k: string, i: number) => setItems(k, state[k].filter((_, idx) => idx !== i));

  const sumOf = (k: string) => state[k].reduce((a, it) => a + (Number(it.max) || 0), 0);

  const payload = useMemo(
    () =>
      JSON.stringify(
        exams.flatMap((e) => e.sections.map((s) => ({ fromLevel: e.fromLevel, sectionKey: s.key, items: state[`${e.fromLevel}:${s.key}`] }))),
      ),
    [exams, state],
  );

  const badSections = exams.flatMap((e) =>
    e.sections.filter((s) => sumOf(`${e.fromLevel}:${s.key}`) !== s.max || !state[`${e.fromLevel}:${s.key}`].every((it) => it.label.trim() && Number(it.max) > 0))
      .map((s) => `L${e.fromLevel} ${s.label}`),
  );

  return (
    <form action={saveExamItems} className="space-y-3">
      <input type="hidden" name="payload" value={payload} />
      <p className="text-sm text-slate-500">
        Add or remove items and set each item&apos;s marks. Each section must still total its cap. New items lose the brief&apos;s &quot;how to test&quot; note. Past graded exams are unaffected.
      </p>

      <div className="space-y-2">
        {exams.map((e) => (
          <details key={e.fromLevel} className="group rounded-xl border border-slate-200 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <span className="text-sm font-semibold text-slate-900">
                {e.title} · L{e.fromLevel}{e.review ? " · Elite review" : ` → ${e.toLevel}`}
              </span>
              <span className="text-xs text-slate-400 transition-transform group-open:rotate-180">▼</span>
            </summary>
            <div className="grid gap-4 border-t border-slate-100 p-4 sm:grid-cols-2">
              {e.sections.map((s) => {
                const k = `${e.fromLevel}:${s.key}`;
                const sum = sumOf(k);
                const ok = sum === s.max;
                return (
                  <div key={s.key} className="rounded-lg border border-slate-200 p-3">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">{s.label}</span>
                      <span className={cn("rounded px-1.5 py-0.5 text-xs font-semibold tabular-nums", ok ? "bg-green-50 text-green-700" : "bg-red-50 text-red-700")}>
                        {sum} / {s.max}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {state[k].map((it, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <input
                            value={it.label}
                            onChange={(ev) => upd(k, i, { label: ev.target.value })}
                            placeholder="Item name"
                            className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
                          />
                          <input
                            type="number"
                            min={1}
                            value={it.max}
                            onChange={(ev) => upd(k, i, { max: Math.max(0, Math.round(Number(ev.target.value) || 0)) })}
                            className="w-14 rounded-md border border-slate-300 px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
                          />
                          <button
                            type="button"
                            onClick={() => remove(k, i)}
                            aria-label="Remove item"
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                    <button type="button" onClick={() => add(k)} className="mt-2 text-xs font-medium text-green-700 hover:underline">+ Add item</button>
                  </div>
                );
              })}
            </div>
          </details>
        ))}
      </div>

      {badSections.length > 0 && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
          Fix before saving — these sections don&apos;t total their cap or have a blank item: {badSections.join(" · ")}
        </p>
      )}
      <button type="submit" className={buttonClass("primary")} disabled={badSections.length > 0}>Save exam items</button>
    </form>
  );
}
