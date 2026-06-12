"use client";

import { useState } from "react";

// A row of 1–max tap buttons that writes the chosen value to a hidden input,
// so it submits inside a normal server-action form. Used for the monthly growth
// assessment (rate each dimension 1–5 by tapping, no number typing).
export function RatingButtons({
  name,
  max = 5,
  defaultValue = 0,
}: {
  name: string;
  max?: number;
  defaultValue?: number;
}) {
  const [val, setVal] = useState(defaultValue);
  return (
    <div className="flex items-center gap-1.5">
      <input type="hidden" name={name} value={val} />
      {Array.from({ length: max }, (_, i) => i + 1).map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => setVal(n)}
          aria-label={`${n} of ${max}`}
          className={
            "h-9 w-9 shrink-0 rounded-lg text-sm font-bold ring-1 ring-inset transition-colors " +
            (val === n
              ? "bg-green-600 text-white ring-transparent"
              : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50")
          }
        >
          {n}
        </button>
      ))}
    </div>
  );
}
