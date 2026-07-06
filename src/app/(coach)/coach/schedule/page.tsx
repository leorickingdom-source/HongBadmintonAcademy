import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState, Badge, Table, Th, Td, cn } from "@/components/ui";
import { Clock, MapPin, ChevronLeft, ChevronRight } from "lucide-react";
import { formatDate, formatTime } from "@/lib/format";
import { MonthCalendar } from "@/components/month-calendar";
import { loadHolidayMap } from "@/lib/holidays-server";
import { dict } from "@/lib/i18n";
import { coachClassIds } from "../_data";

export const dynamic = "force-dynamic";

function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// One tappable row → the session detail page. Used for both upcoming and past.
// Upcoming, non-canceled rows also get a "Leave" link that deep-links to the
// leave form on the detail page (coaches kept missing it buried down that page).
function CoachSessionRow({ s, leaveLabel }: { s: any; leaveLabel: string }) {
  const d = new Date(`${s.session_date}T00:00:00`);
  const upcoming = s.session_date >= todayMYT();
  const canLeave = upcoming && s.status !== "canceled";
  return (
    <li className="flex items-stretch">
      <Link href={`/coach/sessions/${s.id}`} className="flex flex-1 items-center gap-3.5 px-4 py-3.5 hover:bg-slate-50">
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
        {!canLeave && <span className="shrink-0 text-slate-300">›</span>}
      </Link>
      {canLeave && (
        <Link
          href={`/coach/sessions/${s.id}#leave`}
          className="flex shrink-0 items-center border-l border-slate-100 px-3.5 text-xs font-semibold text-amber-700 hover:bg-amber-50"
        >
          {leaveLabel}
        </Link>
      )}
    </li>
  );
}

export default async function CoachSchedulePage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; view?: string }>;
}) {
  const me = await requireRole("coach");
  const L = dict(me.locale);
  const supabase = await createClient();
  const classIds = await coachClassIds(supabase, me.id);

  const sp = await searchParams;
  const monthStr = /^\d{4}-\d{2}$/.test(sp.month ?? "") ? sp.month! : todayMYT().slice(0, 7);
  const view = sp.view === "table" ? "table" : "calendar";
  const viewQ = view === "table" ? "&view=table" : "";
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
          .select("id, class_id, session_date, start_time, end_time, location, status, classes(name, level)")
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

  // Table view mirrors the admin coverage table: per session, how much of the
  // roster the coach has marked. Only fetched when the table is actually shown.
  const markedBySession = new Map<string, number>();
  const rosterByClass = new Map<string, number>();
  if (view === "table" && all.length) {
    const [{ data: attRows }, { data: enrRows }] = await Promise.all([
      supabase.from("attendance").select("session_id").in("session_id", all.map((s) => s.id)),
      supabase.from("enrollments").select("class_id").eq("active", true).in("class_id", classIds),
    ]);
    for (const a of (attRows ?? []) as any[]) markedBySession.set(a.session_id, (markedBySession.get(a.session_id) ?? 0) + 1);
    for (const e of (enrRows ?? []) as any[]) rosterByClass.set(e.class_id, (rosterByClass.get(e.class_id) ?? 0) + 1);
  }

  return (
    <div className="space-y-6">
      <PageHeader title={L.coach_my_schedule} description={L.coach_sched_desc} />
      {classIds.length === 0 ? (
        <EmptyState message={L.not_assigned_classes} />
      ) : (
        <>
        {/* Month nav — browse past + future months on any device. */}
        <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
          <Link href={`/coach/schedule?month=${prevM}${viewQ}`} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div className="text-center">
            <div className="text-sm font-semibold text-slate-900">{monthLabelStr}</div>
            {monthStr !== thisM && (
              <Link href={`/coach/schedule?month=${thisM}${viewQ}`} className="text-xs font-medium text-green-700 hover:underline">{L.back_to_this_month}</Link>
            )}
          </div>
          <Link href={`/coach/schedule?month=${nextM}${viewQ}`} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <ChevronRight className="h-5 w-5" />
          </Link>
        </div>
          {/* View toggle: calendar (default) or a flat table of every session. */}
          <div className="flex justify-end">
            <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 text-sm font-medium shadow-sm">
              <Link href={`/coach/schedule?month=${monthStr}`} className={cn("rounded-md px-3 py-1.5", view === "calendar" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50")}>{L.view_calendar}</Link>
              <Link href={`/coach/schedule?month=${monthStr}&view=table`} className={cn("rounded-md px-3 py-1.5", view === "table" ? "bg-emerald-600 text-white" : "text-slate-600 hover:bg-slate-50")}>{L.view_table}</Link>
            </div>
          </div>

          {view === "table" ? (
            all.length ? (
              <Table>
                <thead>
                  <tr>
                    <Th>{L.col_date}</Th><Th>{L.col_class}</Th><Th>{L.col_place}</Th><Th>{L.col_status}</Th><Th>{L.col_marked}</Th>
                  </tr>
                </thead>
                <tbody>
                  {all.map((s: any) => {
                    const upcoming = s.session_date >= today;
                    const marked = markedBySession.get(s.id) ?? 0;
                    const roster = rosterByClass.get(s.class_id) ?? 0;
                    return (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <Td className="whitespace-nowrap font-medium text-slate-900" label={L.col_date}>
                          <Link href={`/coach/sessions/${s.id}`} className="hover:text-green-700 hover:underline">
                            {formatDate(s.session_date)} · {formatTime(s.start_time)}
                          </Link>
                        </Td>
                        <Td className="text-slate-600" label={L.col_class}>{s.classes?.name ?? "—"}</Td>
                        <Td className="text-slate-500" label={L.col_place}>{s.location ?? "—"}</Td>
                        <Td label={L.col_status}>
                          <Badge tone={s.status === "completed" ? "green" : s.status === "canceled" ? "red" : upcoming ? "blue" : "slate"}>{s.status}</Badge>
                        </Td>
                        <Td label={L.col_marked}>
                          {upcoming ? (
                            <span className="text-slate-300">—</span>
                          ) : (
                            <span className={cn("font-medium", marked === 0 ? "text-red-600" : marked >= roster && roster > 0 ? "text-green-600" : "text-amber-600")}>
                              {marked === 0 ? L.not_marked_word : `${marked}/${roster || marked}`}
                            </span>
                          )}
                        </Td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            ) : (
              <EmptyState message={L.no_sessions_month} />
            )
          ) : (
          <>
          {/* Phone: a readable list — upcoming first, earlier sessions collapsed.
              Tap a row for the full session + roster. */}
          <div className="md:hidden">
            {all.length ? (
              <div className="space-y-4">
                <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                  {(upcoming.length ? upcoming : all).map((s: any) => (
                    <CoachSessionRow key={s.id} s={s} leaveLabel={L.leave_word} />
                  ))}
                </ul>
                {upcoming.length > 0 && past.length > 0 && (
                  <details className="group">
                    <summary className="cursor-pointer list-none text-sm font-medium text-slate-600 hover:text-slate-900">
                      <span className="select-none">▸ {L.earlier_this_month} ({past.length})</span>
                    </summary>
                    <ul className="mt-2 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                      {past.map((s: any) => (
                        <CoachSessionRow key={s.id} s={s} leaveLabel={L.leave_word} />
                      ))}
                    </ul>
                  </details>
                )}
              </div>
            ) : (
              <EmptyState message={L.no_sessions_month} />
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
        </>
      )}
    </div>
  );
}
