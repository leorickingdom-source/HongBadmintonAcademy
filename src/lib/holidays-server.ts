import "server-only";
import { MY_PUBLIC_HOLIDAYS, schoolHolidayMap } from "@/lib/holidays";

// Merged holiday map (date → name) for a date range, combining:
//   1. built-in Malaysian public holidays (src/lib/holidays.ts)
//   2. admin-imported public holidays (public_holidays table) — override built-in
//   3. academy school holidays (school_holidays table) — override both
// `db` is any Supabase client (RLS user or service-role).
export async function loadHolidayMap(db: any, start: string, end: string): Promise<Record<string, string>> {
  const [{ data: schoolRows }, { data: pubRows }] = await Promise.all([
    db.from("school_holidays").select("name, start_date, end_date").lte("start_date", end).gte("end_date", start),
    db.from("public_holidays").select("holiday_date, name").gte("holiday_date", start).lte("holiday_date", end),
  ]);

  const map: Record<string, string> = {};
  for (const h of MY_PUBLIC_HOLIDAYS) if (h.date >= start && h.date <= end) map[h.date] = h.name;
  for (const r of (pubRows ?? []) as any[]) map[r.holiday_date] = r.name;
  const sm = schoolHolidayMap(schoolRows ?? []);
  for (const [d, n] of sm) if (d >= start && d <= end) map[d] = n;
  return map;
}
