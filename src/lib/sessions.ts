import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { loadHolidayMap } from "@/lib/holidays-server";

// Materialize concrete sessions from active weekly class_schedules across a
// rolling horizon, skipping holidays. Idempotent — upserts on the
// (class_id, session_date, start_time) unique key and ignores duplicates, so it
// is safe to run daily and to re-run for a single class.
//
// Shared by the manual "Generate" button on the class page (one class, user
// session/RLS client) and the auto-generate cron (all active classes,
// service-role client).
export async function materializeSessions(
  db: SupabaseClient,
  opts: { classIds?: string[]; horizonDays?: number } = {},
): Promise<{ classes: number; rows: number }> {
  const horizon = Math.min(90, Math.max(1, opts.horizonDays ?? 28));

  let clsQ = db.from("classes").select("id, branch_id").eq("is_active", true);
  if (opts.classIds?.length) clsQ = clsQ.in("id", opts.classIds);
  const { data: classes } = await clsQ;
  if (!classes?.length) return { classes: 0, rows: 0 };

  const classIds = classes.map((c: any) => c.id);
  const branchOf = new Map<string, string | null>(classes.map((c: any) => [c.id, c.branch_id ?? null]));

  const { data: schedules } = await db
    .from("class_schedules")
    .select("*")
    .in("class_id", classIds)
    .eq("is_active", true);
  if (!schedules?.length) return { classes: classes.length, rows: 0 };

  const byClass = new Map<string, any[]>();
  for (const s of schedules) {
    const arr = byClass.get(s.class_id) ?? [];
    arr.push(s);
    byClass.set(s.class_id, arr);
  }

  const start = new Date();
  const lastDay = new Date(start);
  lastDay.setDate(start.getDate() + horizon - 1);
  const holidayMap = await loadHolidayMap(db, start.toLocaleDateString("en-CA"), lastDay.toLocaleDateString("en-CA"));
  const isHoliday = (ymd: string) => Boolean(holidayMap[ymd]);

  const rows: Record<string, unknown>[] = [];
  for (let i = 0; i < horizon; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dow = d.getDay();
    const dateStr = d.toLocaleDateString("en-CA");
    if (isHoliday(dateStr)) continue; // no classes on holidays
    for (const [cid, scheds] of byClass) {
      for (const s of scheds) {
        if (s.day_of_week === dow) {
          rows.push({
            class_id: cid,
            schedule_id: s.id,
            session_date: dateStr,
            start_time: s.start_time,
            end_time: s.end_time,
            location: s.location,
            grace_minutes: s.grace_minutes,
            branch_id: branchOf.get(cid) ?? null,
            status: "scheduled",
          });
        }
      }
    }
  }

  if (rows.length) {
    const { error } = await db.from("sessions").upsert(rows, {
      onConflict: "class_id,session_date,start_time",
      ignoreDuplicates: true,
    });
    if (error) throw new Error(error.message);
  }
  return { classes: classes.length, rows: rows.length };
}
