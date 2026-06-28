import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, Badge, cn } from "@/components/ui";
import { Clock, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { formatTime } from "@/lib/format";
import { MonthCalendar } from "@/components/month-calendar";
import { loadHolidayMap } from "@/lib/holidays-server";
import { coachClassIds } from "../_data";

export const dynamic = "force-dynamic";

function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// One tappable row → the session detail page. Used for both upcoming and past.
function CoachSessionRow({ s }: { s: any }) {
  const d = new Date(`${s.session_date}T00:00:00`);
  const upcoming = s.session_date >= todayMYT();
  return (
    <li>
      <Link href={`/coach/sessions/${s.id}`} className="flex items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50">
        <div className={cn("flex h-14 w-14 shrink-0 flex-col items-center justify-center rounded-xl", upcoming ? "bg-emerald-50" : "bg-slate-100")}>
          <span className={cn("text-[10px] font-semibold uppercase tracking-wide", upcoming ? "text-emerald-600" : "text-slate-500")}>{d.toLocaleDateString("en-MY", { month: "short" })}</span>
          <span className={cn("text-xl font-bold leading-none", upcoming ? "text-emerald-800" : "text-slate-700")}>{d.getDate()}</span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="font-semibold text-slate-900">{s.classes?.name ?? "Class"}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-slate-500">
            <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{d.toLocaleDateString("en-MY", { weekday: "short" })} {formatTime(s.start_time)}–{formatTime(s.end_time)}</span>
            {s.location && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{s.location}</span>}
          </div>
        </div>
        {s.status !== "scheduled" && (
          <Badge tone={s.status === "completed" ? "green" : s.status === "canceled" ? "red" : "blue"}>{s.status}</Badge>
        )}
        <span className="shrink-0 text-slate-300">›</span>
      </Link>
    </li>
  );
}

export default async function CoachSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const me = await requireRole("coach");
  const supabase = await createClient();
  const classIds = await coachClassIds(supabase, me.id);

  const monthStr = /^\d{4}-\d{2}$/.test((await searchParams).month ?? "") ? (await searchParams).month! : todayMYT().slice(0, 7);
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${monthStr}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const prevM = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const nextM = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const thisM = todayMYT().slice(0, 7);
  const monthLabelStr = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-MY", { month: "long", year: "numeric" });

  const [{ data: sessions }, holidays] = await Promise.all([
    classIds.length
      ? supabase
          .from("sessions")
          .select("id, session_date, start_time, end_time, location, status, classes(name, level)")
          .in("class_id", classIds)
          .gte("session_date", start)
          .lte("session_date", end)
          .order("session_date")
          .order("start_time")
          .limit(400)
      : Promise.resolve({ data: [] as any[] }),
    loadHolidayMap(supabase, start, end),
  ]);

  const all = (sessions ?? []) as any[];
  const today = todayMYT();
  const upcoming = all.filter((s) => s.session_date >= today);
  const past = all.filter((s) => s.session_date < today);

  return (
    <div className="space-y-6">
      <PageHeader title="My schedule" description="Your classes' sessions, month by month — browse back for past classes." />
      {classIds.length === 0 ? (
        <EmptyState message="You're not assigned to any classes yet." />
      ) : (
        <>
        {/* Month nav — browse past + future months on any device. */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <Link href={`/coach/schedule?month=${prevM}`} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="text-center">
            <div className="text-sm font-semibold text-slate-900">{monthLabelStr}</div>
            {monthStr !== thisM && (
              <Link href={`/coach/schedule?month=${thisM}`} className="text-xs font-medium text-green-700 hover:underline">Back to this month</Link>
            )}
          </div>
          <Link href={`/coach/schedule?month=${nextM}`} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
          {/* Phone: a readable list — upcoming first, earlier sessions collapsed.
              Tap a row for the full session + roster. */}
          <div className="md:hidden">
            {all.length ? (
              <div className="space-y-4">
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {(upcoming.length ? upcoming : all).map((s: any) => (
                    <CoachSessionRow key={s.id} s={s} />
                  ))}
                </ul>
                {upcoming.length > 0 && past.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer list-none text-sm font-medium text-slate-600 hover:text-slate-900">
                      <span className="select-none">▸ Earlier this month ({past.length})</span>
                    </summary>
                    <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {past.map((s: any) => (
                        <CoachSessionRow key={s.id} s={s} />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ) : (
              <EmptyState message="No sessions this month." />
            )}
          </div>

          {/* Desktop: the month calendar. Tap a tile for the session detail. */}
          <div className="hidden md:block">
            <MonthCalendar
              monthStr={monthStr}
              basePath="/coach/schedule"
              interactive={false}
              detailBase="/coach/sessions"
              holidays={holidays}
              sessions={(sessions ?? []).map((s: any) => ({
                id: s.id,
                session_date: s.session_date,
                start_time: s.start_time,
                end_time: s.end_time,
                location: s.location,
                status: s.status,
                className: s.classes?.name ?? null,
                classRank: s.classes?.level ?? null,
              }))}
            />
          </div>
        </>
      )}
    </div>
  );
}
