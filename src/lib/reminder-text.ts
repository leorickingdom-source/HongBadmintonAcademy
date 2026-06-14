import { formatCurrency, formatDate } from "@/lib/format";

// Malaysia (UTC+8) wall-clock date as YYYY-MM-DD.
function mytToday(): string {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Parent-facing fee reminder line. Picks tense from the due date so an overdue
// invoice no longer reads "is due <a past date>". Pure (no DB / server-only) —
// safe to call from server components and server actions alike. The queued
// worker reminders use their own milestone phrasing in src/lib/reminders.ts.
export function feeReminderText(opts: {
  parentName?: string | null;
  studentName?: string | null;
  amount: number | string;
  currency: string;
  dueDate?: string | null;
  payUrl: string;
  today?: string; // YYYY-MM-DD (MYT); defaults to today
}): string {
  const { parentName, studentName, amount, currency, dueDate, payUrl } = opts;
  const fee = formatCurrency(Number(amount), currency);
  const who = parentName || "Parent";
  const child = studentName || "your child";
  const today = opts.today ?? mytToday();

  if (dueDate && dueDate < today) {
    const days = Math.floor((Date.parse(today) - Date.parse(dueDate)) / 86_400_000);
    return `Hi ${who}, the fee of ${fee} for ${child} was due on ${formatDate(dueDate)} and is now ${days} day${days === 1 ? "" : "s"} overdue. Please settle it here: ${payUrl}`;
  }
  if (dueDate && dueDate === today) {
    return `Hi ${who}, a friendly reminder that the fee of ${fee} for ${child} is due today. Pay here: ${payUrl}`;
  }
  return `Hi ${who}, a reminder that the fee of ${fee} for ${child} is due${dueDate ? ` on ${formatDate(dueDate)}` : ""}. Pay here: ${payUrl}`;
}
