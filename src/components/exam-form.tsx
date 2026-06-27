"use client";

import { useMemo, useState } from "react";
import { buttonClass, cn } from "@/components/ui";
import {
  bandFor, defaultDecision, DECISION_LABEL, PERFORMANCE_RUBRIC,
  type Decision, type ExamSpec, type ExamItem,
} from "@/lib/training";
import { createLevelExam } from "@/app/(coach)/coach/exams/actions";

// Collapsible "How to test" panel — the brief's Objective / Test Method / Pass
// Indicator + the generic 0–5 score guide, shown only when the item has detail.
function HowToTest({ it }: { it: ExamItem }) {
  if (!it.objective && !it.method && !it.pass) return null;
  return (
    <details className="group mt-2">
      <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-md bg-blue-50 px-2 py-1 text-xs font-medium text-blue-700">
        <span className="transition-transform group-open:rotate-90">▸</span> How to test
      </summary>
      <div className="mt-2 space-y-2 rounded-lg border border-blue-100 bg-blue-50/40 p-3 text-xs">
        {it.objective && <p><span className="font-semibold text-slate-600">Objective.</span> <span className="text-slate-600">{it.objective}</span></p>}
        {it.method && <p><span className="font-semibold text-slate-600">Method.</span> <span className="text-slate-600">{it.method}</span></p>}
        <p className="text-slate-500">
          <span className="font-semibold text-slate-600">Rubric (per 5 marks).</span>{" "}
          {PERFORMANCE_RUBRIC.map((r) => `${r.score} ${r.label.split(" — ")[1] ?? r.label}`).join(" · ")}
        </p>
        {it.pass && (
          <p className="rounded-md bg-green-50 px-2 py-1.5 text-green-800">
            <span className="font-semibold">Pass:</span> {it.pass}
          </p>
        )}
      </div>
    </details>
  );
}

const TONE_RING: Record<string, string> = {
  green: "border-green-300 bg-green-50 text-green-700",
  blue: "border-blue-300 bg-blue-50 text-blue-700",
  yellow: "border-amber-300 bg-amber-50 text-amber-700",
  red: "border-red-300 bg-red-50 text-red-700",
};

// Live-scoring promotion-exam form. Coach types a score per item; section
// subtotals, the /100 total and the pass band update as they go. The decision
// auto-follows the suggested band until the coach overrides it.
export function ExamForm({
  studentId,
  spec,
}: {
  studentId: string;
  spec: ExamSpec;
}) {
  const [scores, setScores] = useState<Record<string, number>>({});
  const [decision, setDecision] = useState<Decision | null>(null);

  const set = (key: string, max: number, v: string) => {
    const n = Math.max(0, Math.min(max, Math.round(Number(v) || 0)));
    setScores((s) => ({ ...s, [key]: n }));
  };

  const subtotals = useMemo(() => {
    const out: Record<string, number> = {};
    for (const sec of spec.sections) {
      out[sec.key] = sec.items.reduce((a, it, i) => a + (scores[`s_${sec.key}_${i}`] ?? 0), 0);
    }
    return out;
  }, [scores, spec]);

  const total = Object.values(subtotals).reduce((a, b) => a + b, 0);
  const band = bandFor(total);
  const suggestion = defaultDecision(total, !!spec.review);
  const effectiveDecision = decision ?? suggestion;

  // L6 review can't promote — only Retain Elite / Reassess.
  const decisionOptions: Decision[] = spec.review ? ["maintain", "reassess"] : ["promote", "maintain", "reassess"];

  return (
    <form action={createLevelExam} className="space-y-5">
      <input type="hidden" name="student_id" value={studentId} />
      <input type="hidden" name="from_level" value={spec.fromLevel} />

      {spec.sections.map((sec) => (
        <div key={sec.key} className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-2 bg-slate-50 px-4 py-2.5">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{sec.label}</span>
            <span className="text-sm font-bold tabular-nums text-slate-900">
              {subtotals[sec.key]} <span className="text-xs font-normal text-slate-400">/ {sec.max}</span>
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {sec.items.map((it, i) => {
              const key = `s_${sec.key}_${i}`;
              return (
                <div key={key} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <label htmlFor={key} className="min-w-0 text-sm text-slate-800">{it.label}</label>
                    <div className="flex shrink-0 items-center gap-1.5">
                      <input
                        id={key}
                        name={key}
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={it.max}
                        step={1}
                        value={scores[key] ?? ""}
                        onChange={(e) => set(key, it.max, e.target.value)}
                        placeholder="0"
                        className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-right text-sm tabular-nums outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
                      />
                      <span className="w-8 text-xs text-slate-400">/ {it.max}</span>
                    </div>
                  </div>
                  <HowToTest it={it} />
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {/* Live total + band */}
      <div className={cn("flex items-center justify-between gap-3 rounded-xl border px-4 py-3", TONE_RING[band.tone])}>
        <div>
          <div className="text-xs font-medium uppercase tracking-wide opacity-70">Total score</div>
          <div className="text-2xl font-bold tabular-nums">{total} <span className="text-base font-normal opacity-60">/ 100</span></div>
        </div>
        <div className="text-right">
          <div className="text-lg font-bold">{band.label}</div>
          <div className="text-xs opacity-80">{band.note}</div>
        </div>
      </div>

      {/* Decision */}
      <div className="space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Promotion decision</span>
        <div className="flex flex-wrap gap-2">
          {decisionOptions.map((d) => {
            const active = effectiveDecision === d;
            return (
              <button
                key={d}
                type="button"
                onClick={() => setDecision(d)}
                className={cn(
                  "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                  active ? "border-green-600 bg-green-600 text-white" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
                )}
              >
                {d === "maintain" && spec.review ? "Retain Elite" : DECISION_LABEL[d]}
              </button>
            );
          })}
        </div>
        <input type="hidden" name="decision" value={effectiveDecision} />
        {decision == null && (
          <p className="text-xs text-slate-400">Suggested from score — tap to change.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Coach comment</span>
        <textarea
          name="comment"
          placeholder="Strong areas, what to improve, a moment that stood out…"
          className="min-h-20 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
        />
      </div>

      <div className="space-y-1.5">
        <span className="text-sm font-medium text-slate-700">Next target</span>
        <input
          name="next_target"
          placeholder="e.g. Improve backhand clear consistency; faster six-corner recovery"
          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
        />
      </div>

      <button type="submit" className={buttonClass("primary")}>Save exam result</button>
    </form>
  );
}
