import { formatTime } from "@/lib/format";

export interface CalendarSession {
  id: string;
  session_date: string; // YYYY-MM-DD
  start_time: string;
  end_time: string;
  location: string | null;
  status: string;
  className?: string | null;
}

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function ymd(d: Date): string {
  return d.toLocaleDateString("en-CA");
}
function mondayOf(d: Date): Date {
  const x = new Date(d);
  const off = (x.getDay() + 6) % 7; // 0 = Monday
  x.setDate(x.getDate() - off);
  x.setHours(0, 0, 0, 0);
  return x;
}

// Read-friendly weekly grid of dated sessions, grouped week by week. Each day
// column lists that day's sessions (time + class), coloured by status.
export function SessionCalendar({ sessions }: { sessions: CalendarSession[] }) {
  if (!sessions.length) return null;

  const byDate = new Map<string, CalendarSession[]>();
  const weeks = new Map<string, Date>();
  for (const s of sessions) {
    const list = byDate.get(s.session_date) ?? [];
    list.push(s);
    byDate.set(s.session_date, list);
    const m = mondayOf(new Date(`${s.session_date}T00:00:00`));
    weeks.set(ymd(m), m);
  }
  const sortedWeeks = [...weeks.values()].sort((a, b) => a.getTime() - b.getTime());
  const todayYmd = ymd(new Date());

  return (
    <div className="space-y-4">
      {sortedWeeks.map((monday) => {
        const days = Array.from({ length: 7 }, (_, i) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + i);
          return d;
        });
        const label = `${days[0].toLocaleDateString("en-GB", { day: "numeric", month: "short" })} – ${days[6].toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}`;
        return (
          <div key={ymd(monday)} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 px-4 py-2.5 text-sm font-semibold text-slate-800">{label}</div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[760px] grid-cols-7">
                {days.map((d, i) => {
                  const list = (byDate.get(ymd(d)) ?? []).sort((a, b) => a.start_time.localeCompare(b.start_time));
                  const isToday = ymd(d) === todayYmd;
                  return (
                    <div
                      key={i}
                      className={"min-h-[96px] border-r border-slate-100 p-2 last:border-r-0 " + (i >= 5 ? "bg-slate-50/60" : "")}
                    >
                      <div className={"mb-1.5 text-xs " + (isToday ? "font-bold text-green-700" : "text-slate-400")}>
                        {DOW[i]} {d.getDate()}
                      </div>
                      <div className="space-y-1">
                        {list.map((s) => {
                          const canceled = s.status === "canceled";
                          const tone = canceled
                            ? "border-red-200 bg-red-50 text-red-700"
                            : s.status === "completed"
                              ? "border-green-200 bg-green-50 text-green-800"
                              : "border-blue-200 bg-blue-50 text-blue-800";
                          return (
                            <div
                              key={s.id}
                              title={`${s.className ?? "Class"} · ${formatTime(s.start_time)}–${formatTime(s.end_time)}${s.location ? " · " + s.location : ""}`}
                              className={"rounded-md border px-1.5 py-1 text-[11px] leading-tight " + tone + (canceled ? " line-through opacity-70" : "")}
                            >
                              <div className="font-medium">{formatTime(s.start_time)}</div>
                              <div className="truncate">{s.className ?? "Class"}</div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
