// Malaysian national public holidays + the academy's own school-holiday ranges.
//
// Public holidays are a built-in list (no external API). Lunar/Islamic dates are
// approximate for 2026 — verify against the official gazette and edit freely.
// State-only holidays are intentionally omitted (national/federal only).

export interface Holiday {
  date: string; // YYYY-MM-DD
  name: string;
}

export const MY_PUBLIC_HOLIDAYS: Holiday[] = [
  { date: "2026-01-01", name: "New Year's Day" },
  { date: "2026-02-17", name: "Chinese New Year" },
  { date: "2026-02-18", name: "Chinese New Year (2nd day)" },
  { date: "2026-03-20", name: "Hari Raya Aidilfitri" },
  { date: "2026-03-21", name: "Hari Raya Aidilfitri (2nd day)" },
  { date: "2026-05-01", name: "Labour Day" },
  { date: "2026-05-27", name: "Hari Raya Haji" },
  { date: "2026-05-31", name: "Wesak Day" },
  { date: "2026-06-01", name: "Agong's Birthday" },
  { date: "2026-06-16", name: "Awal Muharram" },
  { date: "2026-08-25", name: "Maulidur Rasul" },
  { date: "2026-08-31", name: "National Day" },
  { date: "2026-09-16", name: "Malaysia Day" },
  { date: "2026-11-08", name: "Deepavali" },
  { date: "2026-12-25", name: "Christmas Day" },
];

const PUBLIC_BY_DATE = new Map(MY_PUBLIC_HOLIDAYS.map((h) => [h.date, h.name]));

export function publicHolidayName(ymd: string): string | null {
  return PUBLIC_BY_DATE.get(ymd) ?? null;
}

export interface SchoolHoliday {
  id?: string;
  start_date: string; // YYYY-MM-DD (inclusive)
  end_date: string; // YYYY-MM-DD (inclusive)
  name: string;
}

// Expand school-holiday ranges into a date→name map (bounded to avoid runaway
// loops on a bad range). Useful for per-day calendar rendering.
export function schoolHolidayMap(rows: SchoolHoliday[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const r of rows) {
    if (!r.start_date || !r.end_date) continue;
    let d = new Date(`${r.start_date}T00:00:00Z`);
    const end = new Date(`${r.end_date}T00:00:00Z`);
    for (let i = 0; i < 400 && d <= end; i++) {
      map.set(d.toISOString().slice(0, 10), r.name);
      d = new Date(d.getTime() + 86_400_000);
    }
  }
  return map;
}

// Merged holiday name for a date: school holiday takes precedence (more specific),
// else the national public holiday, else null.
export function holidayName(ymd: string, school: Map<string, string>): string | null {
  return school.get(ymd) ?? publicHolidayName(ymd);
}
