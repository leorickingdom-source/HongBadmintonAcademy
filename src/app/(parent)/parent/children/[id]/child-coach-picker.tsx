"use client";

import { useState, useTransition } from "react";
import { UserCog } from "lucide-react";
import { setChildCoach } from "./child-actions";

// Parent picks the coach responsible for their child. Auto-saves on change.
export function ChildCoachPicker({
  studentId,
  coaches,
  current,
  labels,
}: {
  studentId: string;
  coaches: { id: string; full_name: string | null }[];
  current: string | null;
  labels: { title: string; hint: string; none: string; saved: string };
}) {
  const [value, setValue] = useState(current ?? "");
  const [saved, setSaved] = useState(false);
  const [, start] = useTransition();

  function change(next: string) {
    setValue(next);
    setSaved(false);
    start(async () => {
      const r = await setChildCoach({ student_id: studentId, coach_id: next });
      if (r.ok) setSaved(true);
    });
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
        <UserCog className="h-4.5 w-4.5" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium text-slate-900">{labels.title}</div>
        <div className="text-xs text-slate-500">{saved ? labels.saved : labels.hint}</div>
      </div>
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        className="h-9 max-w-[45%] rounded-lg border border-slate-300 bg-white px-2 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none"
      >
        <option value="">{labels.none}</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>{c.full_name ?? c.id}</option>
        ))}
      </select>
    </div>
  );
}
