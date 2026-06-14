import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency, formatDate } from "@/lib/format";

// Very-cautious throttle policy (anti-ban). The app enforces all of this; the
// worker just polls and obeys, so the cadence stays irregular + low-volume.
export const POLICY = {
  dailyCap: 10, // max auto-reminders per MYT day
  minGapMinutes: 10, // never two sends closer than this
  windowStartHour: 9, // MYT, inclusive
  windowEndHour: 20, // MYT, exclusive (so last send by 19:59)
  randomSkipChance: 0.3, // chance a given poll is skipped even when eligible
};

const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia = UTC+8, no DST

// MYT wall-clock date ("YYYY-MM-DD") + hour, derived from the server's UTC clock.
function mytParts() {
  const iso = new Date(Date.now() + MYT_MS).toISOString();
  return { dateStr: iso.slice(0, 10), hour: Number(iso.slice(11, 13)) };
}
function withinWindow(): boolean {
  const { hour } = mytParts();
  return hour >= POLICY.windowStartHour && hour < POLICY.windowEndHour;
}
function todayStartUtcISO(): string {
  return new Date(`${mytParts().dateStr}T00:00:00+08:00`).toISOString();
}
function mytDateStr(offsetDays: number): string {
  return new Date(Date.now() + MYT_MS + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

const PAYABLE = ["unpaid", "overdue"];

// Re-nudge a still-unpaid invoice at these days-late milestones. Each becomes a
// distinct queue `kind` (overdue_3, overdue_7, …) so the (invoice_id, kind)
// dedup sends each milestone exactly once; after the last one the invoice is
// left to the admin (no more auto-nudges).
const OVERDUE_NUDGES = [3, 7, 14, 28] as const;

// Whole days from one YYYY-MM-DD date to another (both parsed as UTC midnight).
function daysBetween(fromDate: string, toDate: string): number {
  return Math.floor((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000);
}

function buildBody(
  kind: string,
  parentName: string,
  studentName: string,
  amount: unknown,
  currency: string,
  dueDate: string,
  payUrl: string,
  daysLate = 0,
): string {
  const fee = formatCurrency(Number(amount), currency);
  if (kind === "due_day") {
    return `Hi ${parentName}, a friendly reminder that the fee of ${fee} for ${studentName} is due today. Pay here: ${payUrl}`;
  }
  if (kind.startsWith("overdue")) {
    return `Hi ${parentName}, the fee of ${fee} for ${studentName} was due on ${formatDate(dueDate)} and is now ${daysLate} day${daysLate === 1 ? "" : "s"} overdue. Please settle it here: ${payUrl}`;
  }
  return `Hi ${parentName}, a reminder that the fee of ${fee} for ${studentName} is due on ${formatDate(dueDate)}. Pay here: ${payUrl}`;
}

// Daily cron: enqueue reminders for invoices due in 3 days (before_due), due
// today (due_day), or already overdue (overdue_<n> at the OVERDUE_NUDGES
// day-late milestones), all still unpaid. Deduped by the (invoice_id, kind) index.
export async function enqueueDueReminders(baseUrl: string) {
  const db = createAdminClient();
  const today = mytDateStr(0);
  const inThree = mytDateStr(3);

  const { data: invoices, error } = await db
    .from("invoices")
    .select(
      "id, amount, currency, due_date, parent_id, status, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name, phone)",
    )
    .in("status", PAYABLE)
    .in("due_date", [today, inThree]);
  if (error) throw new Error(error.message);

  const rows: Array<Record<string, unknown>> = [];
  for (const inv of invoices ?? []) {
    const parent = (inv as any).parent;
    if (!parent?.phone) continue;
    const kind = inv.due_date === today ? "due_day" : "before_due";
    const studentName = (inv as any).students?.full_name ?? "your child";
    rows.push({
      kind,
      invoice_id: inv.id,
      recipient_profile_id: inv.parent_id,
      recipient_phone: parent.phone,
      body: buildBody(
        kind,
        parent.full_name ?? "Parent",
        studentName,
        inv.amount,
        inv.currency,
        inv.due_date,
        `${baseUrl}/parent/invoices`,
      ),
    });
  }

  // Overdue (still-unpaid, due_date in the past): nudge at the largest milestone
  // reached. Scanning all past-due invoices (not a bounded window) makes this
  // self-healing if the cron ever misses days — dedup skips milestones already
  // sent, so it simply catches up to the current one.
  const { data: overdue, error: odErr } = await db
    .from("invoices")
    .select(
      "id, amount, currency, due_date, parent_id, status, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name, phone)",
    )
    .in("status", PAYABLE)
    .lt("due_date", today);
  if (odErr) throw new Error(odErr.message);

  for (const inv of overdue ?? []) {
    const parent = (inv as any).parent;
    if (!parent?.phone) continue;
    const daysLate = daysBetween(inv.due_date, today);
    // Largest milestone reached so far — avoids firing every earlier milestone
    // at once for an invoice that was already late when first scanned.
    const milestone = [...OVERDUE_NUDGES].reverse().find((t) => daysLate >= t);
    if (milestone == null) continue;
    const kind = `overdue_${milestone}`;
    const studentName = (inv as any).students?.full_name ?? "your child";
    rows.push({
      kind,
      invoice_id: inv.id,
      recipient_profile_id: inv.parent_id,
      recipient_phone: parent.phone,
      body: buildBody(
        kind,
        parent.full_name ?? "Parent",
        studentName,
        inv.amount,
        inv.currency,
        inv.due_date,
        `${baseUrl}/parent/invoices`,
        daysLate,
      ),
    });
  }

  const scanned = (invoices?.length ?? 0) + (overdue?.length ?? 0);
  if (rows.length === 0) return { scanned, enqueued: 0 };
  const { error: upErr } = await db
    .from("message_queue")
    .upsert(rows, { onConflict: "invoice_id,kind", ignoreDuplicates: true });
  if (upErr) throw new Error(upErr.message);
  return { scanned, enqueued: rows.length };
}

type NextResult =
  | { message: { id: string; to: string; text: string } }
  | { message: null; reason: string };

// Worker calls this on each poll. Returns at most one message, only if the
// cautious policy allows right now; otherwise null + a reason.
export async function claimNextQueued(): Promise<NextResult> {
  const db = createAdminClient();

  if (!withinWindow()) return { message: null, reason: "outside-window" };

  // Daily cap (MYT).
  const { count: sentToday } = await db
    .from("message_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", todayStartUtcISO());
  if ((sentToday ?? 0) >= POLICY.dailyCap) return { message: null, reason: "daily-cap" };

  // Minimum gap since the last send.
  const { data: last } = await db
    .from("message_queue")
    .select("sent_at")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.sent_at && Date.now() - new Date(last.sent_at).getTime() < POLICY.minGapMinutes * 60_000) {
    return { message: null, reason: "cooldown" };
  }

  // Irregularity: sometimes do nothing even when eligible.
  if (Math.random() < POLICY.randomSkipChance) return { message: null, reason: "random-skip" };

  // Pick a random queued row (shuffled order).
  const { data: queued } = await db
    .from("message_queue")
    .select("id, invoice_id, recipient_phone, body")
    .eq("status", "queued")
    .limit(25);
  if (!queued || queued.length === 0) return { message: null, reason: "empty" };
  const pick = queued[Math.floor(Math.random() * queued.length)];

  // Don't nudge an invoice that was paid since enqueue.
  if (pick.invoice_id) {
    const { data: inv } = await db
      .from("invoices")
      .select("status")
      .eq("id", pick.invoice_id)
      .maybeSingle();
    if (inv && !PAYABLE.includes(inv.status)) {
      await db
        .from("message_queue")
        .update({ status: "canceled", error: "invoice no longer payable" })
        .eq("id", pick.id);
      return { message: null, reason: "canceled-paid" };
    }
  }

  // Claim it (guard against double-claim).
  const { data: claimed } = await db
    .from("message_queue")
    .update({ status: "sending" })
    .eq("id", pick.id)
    .eq("status", "queued")
    .select("id")
    .maybeSingle();
  if (!claimed) return { message: null, reason: "race" };

  return { message: { id: pick.id, to: pick.recipient_phone, text: pick.body } };
}

// Worker reports the send outcome. On success also writes to the messages log.
export async function recordQueueResult(
  id: string,
  status: "sent" | "failed",
  providerMessageId?: string | null,
  error?: string | null,
) {
  const db = createAdminClient();
  const { data: row } = await db.from("message_queue").select("*").eq("id", id).maybeSingle();
  if (!row) return;

  if (status === "sent") {
    const sentAt = new Date().toISOString();
    await db
      .from("message_queue")
      .update({ status: "sent", sent_at: sentAt, provider_message_id: providerMessageId ?? null, error: null })
      .eq("id", id);
    await db.from("messages").insert({
      type: "payment_reminder",
      recipient_profile_id: row.recipient_profile_id,
      recipient_phone: row.recipient_phone,
      body: row.body,
      invoice_id: row.invoice_id,
      provider: "wwebjs",
      status: "sent",
      provider_message_id: providerMessageId ?? null,
      sent_at: sentAt,
    });
    return;
  }

  // Failed: retry a couple of times before giving up.
  const attempts = (row.attempts ?? 0) + 1;
  if (attempts < 3) {
    await db.from("message_queue").update({ status: "queued", attempts, error: error ?? null }).eq("id", id);
  } else {
    await db.from("message_queue").update({ status: "failed", attempts, error: error ?? null }).eq("id", id);
    await db.from("messages").insert({
      type: "payment_reminder",
      recipient_profile_id: row.recipient_profile_id,
      recipient_phone: row.recipient_phone,
      body: row.body,
      invoice_id: row.invoice_id,
      provider: "wwebjs",
      status: "failed",
      error: error ?? null,
    });
  }
}
