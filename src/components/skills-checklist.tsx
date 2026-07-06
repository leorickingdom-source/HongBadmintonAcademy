"use client";

import { useState, useTransition } from "react";
import { cn } from "@/components/ui";
import { useFlash } from "@/components/flash";
import { dict } from "@/lib/i18n";
import { setSkill } from "@/app/(coach)/coach/exams/[studentId]/skill-actions";

type Group = { label: string; items: string[] };

// Coach ticks off the skills a student has mastered at their current level.
// Optimistic; a failed save reverts + flashes. skill_key = "<groupIdx>.<itemIdx>".
export function SkillsChecklist({
  studentId,
  level,
  groups,
  initial,
  locale,
}: {
  studentId: string;
  level: number;
  groups: Group[];
  initial: string[];
  locale?: string | null;
}) {
  const L = dict(locale);
  const [mastered, setMastered] = useState<Set<string>>(new Set(initial));
  const { flash, node } = useFlash();
  const [, startTransition] = useTransition();

  const total = groups.reduce((a, g) => a + g.items.length, 0);
  const count = mastered.size;
  const pct = total ? Math.round((count / total) * 100) : 0;

  function toggle(key: string) {
    const on = !mastered.has(key);
    const prev = new Set(mastered);
    const next = new Set(mastered);
    if (on) next.add(key);
    else next.delete(key);
    setMastered(next);
    startTransition(async () => {
      const r = await setSkill({ student_id: studentId, level, skill_key: key, on });
      if (!r.ok) {
        setMastered(prev);
        flash(L.save_fail);
      }
    });
  }

  return (
    <div className="space-y-4">
      {node}
      <div className="flex items-center gap-3">
        <span className="text-sm font-semibold text-slate-800">{count} / {total} {L.skills_mastered}</span>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-2 rounded-full bg-emerald-500 transition-all" style={{ width: `${pct}%` }} />
        </div>
      </div>
      {groups.map((g, gi) => (
        <div key={gi}>
          <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">{g.label}</div>
          <div className="flex flex-wrap gap-2">
            {g.items.map((it, ii) => {
              const key = `${gi}.${ii}`;
              const on = mastered.has(key);
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => toggle(key)}
                  aria-pressed={on}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-sm transition-colors",
                    on ? "border-emerald-300 bg-emerald-50 text-emerald-800" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50",
                  )}
                >
                  <span className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] font-bold", on ? "border-emerald-500 bg-emerald-500 text-white" : "border-slate-300 text-transparent")}>✓</span>
                  {it}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
