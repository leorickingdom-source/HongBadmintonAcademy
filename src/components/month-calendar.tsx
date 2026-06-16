import Link from "next/link";
import { SessionTile, type CalendarSession } from "@/components/session-tile";

export type { CalendarSession };

const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

// Today in Malaysia time, as YYYY-MM-DD.
function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// Month grid (Mon-first) of dated sessions. Server component — month navigation
// is plain links (?month=YYYY-MM). Each session tile (client) opens a modal.
export function MonthCalendar({
  sessions,
  monthStr, // "YYYY-MM" of the displayed month
  basePath = "/admin/sessions",
  holidays = {},
}: {
  sessions: CalendarSession[];
  monthStr: string;
  basePath?: string;
  holidays?: Record<string, string>; // ymd -> holiday name
}) {
  const [yStr, mStr] = monthStr.split("-");
  const year = Number(yStr);
  const month = Number(mStr) - 1; // 0-based

  const byDate = new Map<string, CalendarSession[]>();
  for (const s of sessions) {
    const list = byDate.get(s.session_date) ?? [];
    list.push(s);
    byDate.set(s.session_date, list);
  }

  // Grid math in UTC to avoid timezone drift (we only care about calendar days).
  const first = new Date(Date.UTC(year, month, 1));
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const lead = (first.getUTCDay() + 6) % 7; // 0 = Monday
  const cells: (number | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);
  while (cells.length % 7 !== 0) cells.push(null);

  const label = first.toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" });
  const prev = `${month === 0 ? year - 1 : year}-${pad(month === 0 ? 12 : month)}`;
  const next = `${month === 11 ? year + 1 : year}-${pad(month === 11 ? 1 : month + 2)}`;
  const thisMonth = todayMYT().slice(0, 7);
  const todayYmd = todayMYT();

  const navBtn = "inline-flex h-8 items-center rounded-lg border border-slate-300 px-2.5 text-sm text-slate-600 hover:bg-slate-50 hover:text-slate-900";

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-2.5">
        <div className="text-sm font-semibold text-slate-800">{label}</div>
        <div className="flex items-center gap-1.5">
          <Link href={`${basePath}?month=${prev}`} className={navBtn} aria-label="Previous month">←</Link>
          <Link href={`${basePath}?month=${thisMonth}`} className={navBtn}>Today</Link>
          <Link href={`${basePath}?month=${next}`} className={navBtn} aria-label="Next month">→</Link>
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          <div className="grid grid-cols-7 border-b border-slate-100 bg-slate-50">
            {DOW.map((d, i) => (
              <div key={d} className={"px-2 py-1.5 text-center text-xs font-medium " + (i >= 5 ? "text-slate-400" : "text-slate-500")}>
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {cells.map((day, i) => {
              const weekend = i % 7 >= 5;
              if (day == null) {
                return <div key={i} className={"min-h-[92px] border-b border-r border-slate-100 last:border-r-0 " + (weekend ? "bg-slate-50/40" : "")} />;
              }
              const ymd = `${year}-${pad(month + 1)}-${pad(day)}`;
              const list = (byDate.get(ymd) ?? []).sort((a, b) => a.start_time.localeCompare(b.start_time));
              const isToday = ymd === todayYmd;
              const holiday = holidays[ymd];
              return (
                <div key={i} className={"min-h-[92px] border-b border-r border-slate-100 p-1.5 last:border-r-0 " + (holiday ? "bg-rose-50/60" : weekend ? "bg-slate-50/40" : "")}>
                  <div className={"mb-1 text-xs " + (isToday ? "font-bold text-green-700" : "text-slate-400")}>{day}</div>
                  {holiday && (
                    <div className="mb-1 truncate text-[9px] font-medium text-rose-600" title={holiday}>🎌 {holiday}</div>
                  )}
                  <div className="space-y-1">
                    {list.map((s) => <SessionTile key={s.id} s={s} />)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
