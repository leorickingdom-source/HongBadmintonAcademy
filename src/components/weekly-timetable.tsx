import { formatTime } from "@/lib/format";

export interface TimetableSlot {
  className: string;
  day_of_week: number; // 0 = Sunday … 6 = Saturday (JS/Postgres convention)
  start_time: string;
  end_time: string;
  location: string | null;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Recurring weekly master timetable: every class's regular slots laid out
// Mon–Sun. Shows the weekly rhythm, independent of any specific date.
export function WeeklyTimetable({ slots }: { slots: TimetableSlot[] }) {
  const cols: TimetableSlot[][] = Array.from({ length: 7 }, () => []);
  for (const s of slots) cols[(s.day_of_week + 6) % 7].push(s); // Mon = 0
  cols.forEach((c) => c.sort((a, b) => a.start_time.localeCompare(b.start_time)));

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-w-[760px] grid-cols-7">
        {DOW.map((d, i) => (
          <div key={i} className={"border-r border-slate-100 last:border-r-0 " + (i >= 5 ? "bg-slate-50/60" : "")}>
            <div className="border-b border-slate-100 px-2 py-2 text-center text-xs font-semibold text-slate-600">{d}</div>
            <div className="min-h-[110px] space-y-1.5 p-2">
              {cols[i].length === 0 ? (
                <div className="pt-3 text-center text-xs text-slate-300">—</div>
              ) : (
                cols[i].map((s, j) => (
                  <div key={j} className="rounded-md border border-green-200 bg-green-50 px-2 py-1.5">
                    <div className="truncate text-xs font-medium text-green-900">{s.className}</div>
                    <div className="text-[11px] text-green-700">
                      {formatTime(s.start_time)}–{formatTime(s.end_time)}
                    </div>
                    {s.location && <div className="truncate text-[11px] text-slate-500">{s.location}</div>}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
