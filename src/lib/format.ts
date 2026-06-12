export function formatCurrency(
  amount: number,
  currency = "MYR",
  opts?: { whole?: boolean },
): string {
  return new Intl.NumberFormat("en-MY", {
    style: "currency",
    currency,
    ...(opts?.whole ? { maximumFractionDigits: 0 } : {}),
  }).format(amount);
}

export function formatDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-MY", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
}

export function formatDateTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-MY", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function formatTime(t: string | null | undefined): string {
  if (!t) return "—";
  // t is "HH:MM:SS" or "HH:MM"
  const [h, m] = t.split(":");
  return `${h}:${m}`;
}

export function monthLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-MY", { year: "numeric", month: "long" });
}

// Monday (start) of the current week in Malaysia time, as "YYYY-MM-DD".
export function currentWeekStartMYT(): string {
  const now = new Date(Date.now() + 8 * 3600 * 1000); // MYT
  const dow = now.getUTCDay(); // 0=Sun … 6=Sat
  const diff = dow === 0 ? -6 : 1 - dow; // days back to Monday
  const monday = new Date(now);
  monday.setUTCDate(now.getUTCDate() + diff);
  return monday.toISOString().slice(0, 10);
}

// "02 Jun – 08 Jun" for a week starting on the given Monday.
export function weekLabel(weekStart: string | null | undefined): string {
  if (!weekStart) return "—";
  const d = new Date(weekStart);
  if (Number.isNaN(d.getTime())) return "—";
  const end = new Date(d);
  end.setUTCDate(d.getUTCDate() + 6);
  const fmt = (x: Date) =>
    x.toLocaleDateString("en-MY", { day: "2-digit", month: "short", timeZone: "UTC" });
  return `${fmt(d)} – ${fmt(end)}`;
}

export const DAY_NAMES = [
  "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday",
];

export function dayName(dow: number): string {
  return DAY_NAMES[dow] ?? "—";
}
