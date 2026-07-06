"use client";

import { useState, useTransition } from "react";
import { UserCog, Check } from "lucide-react";
import { Avatar } from "@/components/ui";
import { setChildCoach } from "./child-actions";

// Parent picks the coach responsible for their child. Prominent card so it reads
// as a real, editable choice — shows the current coach's name up top.
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
  const currentName = coaches.find((c) => c.id === value)?.full_name ?? null;

  function change(next: string) {
    setValue(next);
    setSaved(false);
    start(async () => {
      const r = await setChildCoach({ student_id: studentId, coach_id: next });
      if (r.ok) setSaved(true);
    });
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <UserCog className="h-3.5 w-3.5" />{labels.title}
          </div>
          <div className="mt-0.5 flex items-center gap-1.5">
            {currentName ? <Avatar name={currentName} size={20} /> : null}
            <span className="truncate text-sm font-semibold text-slate-900">{currentName ?? labels.none}</span>
            {saved && <span className="inline-flex items-center gap-0.5 text-xs font-semibold text-emerald-600"><Check className="h-3.5 w-3.5" />{labels.saved}</span>}
          </div>
        </div>
      </div>
      <select
        value={value}
        onChange={(e) => change(e.target.value)}
        className="mt-3 h-9 w-full rounded-lg border border-slate-300 bg-white px-3 text-sm font-medium text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
      >
        <option value="">{labels.none}</option>
        {coaches.map((c) => (
          <option key={c.id} value={c.id}>{c.full_name ?? c.id}</option>
        ))}
      </select>
    </div>
  );
}
