"use client";

import { useMemo, useState } from "react";
import { cn } from "@/components/ui";
import { rankBadgeClass, RANK_ORDER as CLASS_RANK_ORDER } from "@/lib/ranks";

export type LbRow = {
  id: string;
  name: string;
  age: number | null;
  attended: number;
  sessions: number;
  rate: number;
  streak: number;
  rank: string;
  classRank: string | null;
};

type Col = "rank" | "classRank" | "name" | "age" | "attended" | "rate" | "streak";

const RANK_STYLE: Record<string, string> = {
  LEGEND: "bg-green-100 text-green-700",
  GOLD: "bg-amber-100 text-amber-700",
  SILVER: "bg-blue-100 text-blue-700",
  BRONZE: "bg-orange-100 text-orange-700",
  NONE: "bg-slate-100 text-slate-500",
};
const RANK_ORDER: Record<string, number> = { LEGEND: 5, GOLD: 4, SILVER: 3, BRONZE: 2, NONE: 1 };
const MEDAL = ["🥇", "🥈", "🥉"];

export function LeaderboardTable({ rows }: { rows: LbRow[] }) {
  const [col, setCol] = useState<Col>("rate");
  const [dir, setDir] = useState<1 | -1>(-1);

  const sorted = useMemo(() => {
    const val = (r: LbRow): number | string =>
      col === "name"
        ? r.name.toLowerCase()
        : col === "rank"
          ? RANK_ORDER[r.rank]
          : col === "classRank"
            ? CLASS_RANK_ORDER[r.classRank ?? ""] ?? 0
            : (r[col] as number);
    return [...rows].sort((a, b) => {
      const x = val(a);
      const y = val(b);
      if (x < y) return -dir;
      if (x > y) return dir;
      return 0;
    });
  }, [rows, col, dir]);

  function sortBy(c: Col) {
    if (c === col) setDir((d) => (d === 1 ? -1 : 1));
    else {
      setCol(c);
      setDir(c === "name" ? 1 : -1);
    }
  }

  function Header({ c, label, align = "center" }: { c: Col; label: string; align?: "left" | "center" }) {
    return (
      <th
        onClick={() => sortBy(c)}
        className={cn(
          "cursor-pointer select-none border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-slate-800",
          align === "left" ? "text-left" : "text-center",
        )}
      >
        {label}
        {col === c ? (dir === 1 ? " ▲" : " ▼") : ""}
      </th>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="border-b border-slate-200 bg-slate-50 px-3 py-2.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">#</th>
            <Header c="name" label="Name" align="left" />
            <Header c="classRank" label="Class rank" />
            <Header c="age" label="Age" />
            <Header c="attended" label="Attended" />
            <Header c="rate" label="Rate" />
            <Header c="streak" label="Max streak" />
            <Header c="rank" label="Attendance tier" />
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => (
            <tr key={r.id} className="hover:bg-slate-50">
              <td className="border-b border-slate-100 px-3 py-2.5 text-center text-slate-400">{i < 3 ? MEDAL[i] : i + 1}</td>
              <td className="border-b border-slate-100 px-3 py-2.5 font-medium text-slate-900">{r.name}</td>
              <td className="border-b border-slate-100 px-3 py-2.5 text-center">
                {r.classRank ? (
                  <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(r.classRank))}>{r.classRank}</span>
                ) : (
                  <span className="text-slate-300">—</span>
                )}
              </td>
              <td className="border-b border-slate-100 px-3 py-2.5 text-center text-slate-500">{r.age ?? "—"}</td>
              <td className="border-b border-slate-100 px-3 py-2.5 text-center text-slate-700">
                {r.attended}
                <span className="text-slate-400">/{r.sessions}</span>
              </td>
              <td className={cn("border-b border-slate-100 px-3 py-2.5 text-center font-semibold", r.rate >= 80 ? "text-green-600" : r.rate >= 50 ? "text-amber-600" : "text-slate-500")}>
                {r.rate}%
              </td>
              <td className="border-b border-slate-100 px-3 py-2.5 text-center font-semibold text-green-700">{r.streak}</td>
              <td className="border-b border-slate-100 px-3 py-2.5 text-center">
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", RANK_STYLE[r.rank] ?? RANK_STYLE.NONE)}>{r.rank}</span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
