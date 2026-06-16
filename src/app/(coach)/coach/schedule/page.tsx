import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { MonthCalendar } from "@/components/month-calendar";
import { loadHolidayMap } from "@/lib/holidays-server";
import { coachClassIds } from "../_data";

export const dynamic = "force-dynamic";

function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
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

  return (
    <div className="space-y-6">
      <PageHeader title="My schedule" description="Your classes' sessions, month by month." />
      {classIds.length === 0 ? (
        <EmptyState message="You're not assigned to any classes yet." />
      ) : (
        <MonthCalendar
          monthStr={monthStr}
          basePath="/coach/schedule"
          interactive={false}
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
      )}
    </div>
  );
}
