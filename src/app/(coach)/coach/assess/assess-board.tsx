"use client";

import { useRef, useState, useTransition } from "react";
import { Avatar, cn } from "@/components/ui";
import { setMonthlyScore, setMonthlyComment, type Dim } from "./actions";

export interface AssessRow {
  student: { id: string; full_name: string; nickname: string | null; photo_url: string | null };
  fitness: number | null;
  skills: number | null;
  attitude: number | null;
  comment: string | null;
}

const DIMS: { key: Dim; label: string }[] = [
  { key: "fitness", label: "Fitness" },
  { key: "skills", label: "Skills" },
  { key: "attitude", label: "Attitude" },
];

// Whole-class monthly grading in one screen. Every tap auto-saves; comments save
// on blur. Mirrors the check-in board's optimistic pattern.
export function AssessBoard({
  classId,
  period,
  initialRows,
}: {
  classId: string;
  period: string; // YYYY-MM-01
  initialRows: AssessRow[];
}) {
  const [rows, setRows] = useState<AssessRow[]>(initialRows);
  const [, startTransition] = useTransition();
  const savedFlash = useRef<Record<string, number>>({});
  const [, force] = useState(0);

  function flash(id: string) {
    savedFlash.current[id] = Date.now();
    force((n) => n + 1);
    setTimeout(() => force((n) => n + 1), 1400);
  }

  function setScore(studentId: string, dim: Dim, value: number) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.student.id !== studentId ? r : { ...r, [dim]: value })));
    startTransition(async () => {
      const r = await setMonthlyScore({ student_id: studentId, class_id: classId, period_month: period, dim, value });
      if (!r.ok) setRows(prev);
      else flash(studentId);
    });
  }

  function saveComment(studentId: string, comment: string) {
    const prev = rows;
    setRows((rs) => rs.map((r) => (r.student.id !== studentId ? r : { ...r, comment })));
    startTransition(async () => {
      const r = await setMonthlyComment({ student_id: studentId, class_id: classId, period_month: period, comment });
      if (!r.ok) setRows(prev);
      else flash(studentId);
    });
  }

  return (
    <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {rows.map((r) => {
        const justSaved = Date.now() - (savedFlash.current[r.student.id] ?? 0) < 1400;
        const done = r.fitness && r.skills && r.attitude;
        return (
          <li key={r.student.id} className="space-y-2.5 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <Avatar name={r.student.full_name} src={r.student.photo_url} size={36} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-slate-900">
                  {r.student.full_name}
                  {r.student.nickname && <span className="ml-1.5 font-normal text-slate-400">“{r.student.nickname}”</span>}
                </div>
                <div className={cn("text-xs font-medium", justSaved ? "text-emerald-600" : done ? "text-green-600" : "text-slate-400")}>
                  {justSaved ? "Saved ✓" : done ? "All 3 marked" : "Tap 1–5 for each"}
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              {DIMS.map((d) => (
                <div key={d.key} className="flex items-center gap-1.5">
                  <span className="w-16 shrink-0 text-xs font-medium uppercase tracking-wide text-slate-400">{d.label}</span>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <button
                      key={n}
                      type="button"
                      onClick={() => setScore(r.student.id, d.key, n)}
                      className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-md text-xs font-bold ring-1 ring-inset transition-colors",
                        r[d.key] === n
                          ? "bg-green-600 text-white ring-transparent"
                          : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50",
                      )}
                    >
                      {n}
                    </button>
                  ))}
                </div>
              ))}
            </div>

            <input
              defaultValue={r.comment ?? ""}
              onBlur={(e) => {
                if ((e.target.value ?? "") !== (r.comment ?? "")) saveComment(r.student.id, e.target.value);
              }}
              placeholder="Comment for the parent (optional) — saves when you tap away"
              maxLength={500}
              className="h-9 w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-sm text-slate-900 outline-none placeholder:text-slate-400 focus:border-emerald-500 focus:bg-white"
            />
          </li>
        );
      })}
      {rows.length === 0 && <li className="px-5 py-4 text-sm text-slate-400">No students enrolled.</li>}
    </ul>
  );
}
