import { Check, Trophy } from "lucide-react";
import { TRAINING_LEVELS, levelName } from "@/lib/training";
import { cn } from "@/components/ui";

// Horizontal 1 → 6 training ladder (Starter → Elite Team) with the student's
// current level highlighted and lower levels marked done. The single source of
// truth for a student's standing on the parent dashboard — replaces the old
// 4-tier RankLadder here so parents see one ladder, not two. Server-safe.
export function LevelLadder({ current }: { current: number | null }) {
  const cur = current ?? 1;
  const fillPct = cur > 1 ? ((cur - 1) / (TRAINING_LEVELS.length - 1)) * 100 : 0;

  return (
    <div>
      <div className="relative flex justify-between px-1">
        <div className="absolute left-4 right-4 top-4 h-0.5 rounded-full bg-slate-200" />
        <div className="absolute left-4 top-4 h-0.5 rounded-full bg-green-600" style={{ width: `calc(${fillPct}% - ${fillPct > 0 ? "1rem" : "0px"})` }} />
        {TRAINING_LEVELS.map((lv) => {
          const done = lv.level < cur;
          const isCurrent = lv.level === cur;
          return (
            <div key={lv.level} className="relative z-10 flex flex-col items-center">
              <span
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold",
                  done && "bg-green-100 text-green-700",
                  isCurrent && "bg-green-600 text-white ring-4 ring-green-100",
                  !done && !isCurrent && "border-2 border-slate-200 bg-white text-slate-400",
                )}
              >
                {done ? <Check className="h-4 w-4" /> : lv.level === 6 ? <Trophy className="h-4 w-4" /> : lv.level}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-2 text-center text-sm font-semibold text-green-700">
        Level {cur} · {levelName(cur)}
      </div>
    </div>
  );
}
