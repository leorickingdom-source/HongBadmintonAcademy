import { Check, Medal, Trophy } from "lucide-react";
import { CLASS_RANKS, RANK_ORDER, RANK_BADGE } from "@/lib/ranks";
import { cn } from "@/components/ui";

// Horizontal Beginner → Elite ladder with the student's current tier highlighted
// and the lower tiers marked done. Presentational + server-safe (no client JS).
export function RankLadder({ current }: { current: string | null }) {
  const curOrder = current ? RANK_ORDER[current] ?? 0 : 0;
  const fillPct = curOrder > 1 ? ((curOrder - 1) / (CLASS_RANKS.length - 1)) * 100 : 0;

  return (
    <div className="relative flex justify-between px-2">
      <div className="absolute left-5 right-5 top-4 h-0.5 rounded-full bg-slate-200" />
      <div className="absolute left-5 top-4 h-0.5 rounded-full bg-green-600" style={{ width: `calc(${fillPct}% - ${fillPct > 0 ? "1.25rem" : "0px"})` }} />
      {CLASS_RANKS.map((rank, i) => {
        const order = i + 1;
        const done = order < curOrder;
        const isCurrent = order === curOrder;
        return (
          <div key={rank} className="relative z-10 flex flex-col items-center gap-1.5">
            <span
              className={cn(
                "flex h-9 w-9 items-center justify-center rounded-full text-sm font-semibold",
                done && "bg-green-100 text-green-700",
                isCurrent && "bg-green-600 text-white ring-4 ring-green-100",
                !done && !isCurrent && "border-2 border-slate-200 bg-white text-slate-400",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : isCurrent ? <Medal className="h-4 w-4" /> : rank === "Elite" ? <Trophy className="h-4 w-4" /> : order}
            </span>
            <span className={cn("text-[11px]", isCurrent ? "font-semibold text-green-700" : done ? "text-slate-600" : "text-slate-400")}>
              {rank}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("en-MY", { month: "short", year: "numeric" });
}

export interface RankEvent {
  from_rank: string | null;
  to_rank: string | null;
  created_at: string;
}

// Vertical timeline of rank changes, newest first. Caller shows a fallback when
// there are no events yet (history only starts accruing on the next change).
export function RankHistory({ events }: { events: RankEvent[] }) {
  return (
    <ol className="space-y-3">
      {events.map((e, i) => {
        const up = i === 0; // newest = the achieved tier; dot it green
        return (
          <li key={i} className="flex items-center gap-3">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", up ? "bg-green-600" : "bg-slate-300")} />
            <span className="flex-1 text-sm text-slate-700">
              {e.from_rank ? (
                <>Promoted to <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", RANK_BADGE[e.to_rank ?? ""] ?? "bg-slate-100 text-slate-600")}>{e.to_rank ?? "—"}</span></>
              ) : (
                <>Joined as <span className={cn("rounded px-1.5 py-0.5 text-xs font-medium", RANK_BADGE[e.to_rank ?? ""] ?? "bg-slate-100 text-slate-600")}>{e.to_rank ?? "—"}</span></>
              )}
            </span>
            <span className="text-xs text-slate-400">{monthYear(e.created_at)}</span>
          </li>
        );
      })}
    </ol>
  );
}
