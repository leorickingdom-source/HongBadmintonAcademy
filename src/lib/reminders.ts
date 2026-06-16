import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatCurrency, formatDate, formatTime, monthLabel } from "@/lib/format";
import { normalizePhoneMY } from "@/lib/wa";
import { isWorkerPaused, isFeeRemindersPaused, getSendPolicy } from "@/lib/settings";
import { getWhatsappProvider } from "@/lib/whatsapp";
import { APP_NAME } from "@/lib/constants";
import { env } from "@/lib/env";

// Anti-ban knobs the app enforces (worker just polls + obeys). Window, daily cap
// and min-gap are admin-tunable via Settings → getSendPolicy(); randomSkipChance
// stays fixed so the cadence is always a bit irregular.
export const POLICY = {
  randomSkipChance: 0.3, // chance a given poll is skipped even when eligible
};

const MYT_MS = 8 * 60 * 60 * 1000; // Malaysia = UTC+8, no DST

// MYT wall-clock date ("YYYY-MM-DD") + hour, derived from the server's UTC clock.
function mytParts() {
  const iso = new Date(Date.now() + MYT_MS).toISOString();
  return { dateStr: iso.slice(0, 10), hour: Number(iso.slice(11, 13)) };
}
function withinWindow(startHour: number, endHour: number): boolean {
  const { hour } = mytParts();
  return hour >= startHour && hour < endHour;
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
    const phone = normalizePhoneMY(parent?.phone);
    if (!phone) continue;
    const kind = inv.due_date === today ? "due_day" : "before_due";
    const studentName = (inv as any).students?.full_name ?? "your child";
    rows.push({
      kind,
      invoice_id: inv.id,
      recipient_profile_id: inv.parent_id,
      recipient_phone: phone,
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
    const phone = normalizePhoneMY(parent?.phone);
    if (!phone) continue;
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
      recipient_phone: phone,
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

// Post ONE monthly notice to the parent Community — instead of messaging each
// parent privately. The worker posts it to the Community Announcements group
// (WA_COMMUNITY_GROUP_ID). Privacy-safe: no child names, scores, amounts or who
// owes — just "log in to view/pay".
//
// Content adapts to what actually happened this month:
//   reports + fees → combined · reports only → reports-only · fees only → fees-only
// Idempotent per month (kind community_monthly:YYYY-MM). While the row is still
// queued it's UPDATED in place (so the scorecard run can seed it and the later
// invoice run can upgrade it to combined); once the worker has sent it, it's
// left alone. Returns the outcome for UI feedback.
export async function upsertCommunityMonthlyNotice(baseUrl: string, immediate = false) {
  const groupId = env.waCommunityGroupId;
  if (!groupId) return { posted: "no-group-id" as const };

  const db = createAdminClient();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toLocaleDateString("en-CA");
  const kind = `community_monthly:${monthStart.slice(0, 7)}`;

  // What's live for this calendar month?
  const [{ count: reports }, { count: fees }] = await Promise.all([
    db.from("scorecards").select("id", { count: "exact", head: true }).gte("generated_at", `${monthStart}T00:00:00Z`),
    db.from("invoices").select("id", { count: "exact", head: true }).eq("period_month", monthStart),
  ]);
  const hasReports = (reports ?? 0) > 0;
  const hasFees = (fees ?? 0) > 0;
  if (!hasReports && !hasFees) return { posted: "skipped" as const };

  let body: string;
  let variant: "combined" | "reports" | "fees";
  if (hasReports && hasFees) {
    variant = "combined";
    body =
      `🏸 ${APP_NAME} — monthly update\n` +
      `📊 New Growth Reports are ready\n` +
      `💳 This month's fees have been issued\n` +
      `Parents — log in to view your child's report and pay your invoice:\n${baseUrl}/parent`;
  } else if (hasReports) {
    variant = "reports";
    body =
      `🏸 ${APP_NAME}\n` +
      `📊 New Growth Reports are ready.\n` +
      `Parents — log in to view your child's full report:\n${baseUrl}/parent/scorecards`;
  } else {
    variant = "fees";
    body =
      `🏸 ${APP_NAME}\n` +
      `💳 This month's fees have been issued.\n` +
      `Parents — log in to view and pay your invoice:\n${baseUrl}/parent/invoices`;
  }

  const { data: existing } = await db
    .from("message_queue")
    .select("id, status")
    .eq("kind", kind)
    .limit(1)
    .maybeSingle();

  let rowId: string;
  let outcome: "queued" | "updated";
  if (existing) {
    if (existing.status === "sent") return { posted: "already-sent" as const, variant };
    const { error } = await db
      .from("message_queue")
      .update({ body, recipient_phone: groupId, status: "queued", error: null })
      .eq("id", existing.id);
    if (error) throw new Error(error.message);
    rowId = existing.id;
    outcome = "updated";
  } else {
    const { data: ins, error } = await db
      .from("message_queue")
      .insert({ kind, recipient_phone: groupId, body })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    rowId = ins!.id;
    outcome = "queued";
  }

  // Manual "Generate this month" path: post the blast NOW (one group message,
  // low ban risk) instead of waiting on the cautious per-parent drip. Crons keep
  // it queued so the reports + fees runs can combine into one notice.
  if (immediate) {
    const result = await getWhatsappProvider().send({ to: groupId, text: body });
    if (result.status === "sent") {
      const sentAt = new Date().toISOString();
      await db.from("message_queue").update({ status: "sent", sent_at: sentAt, provider_message_id: result.providerMessageId ?? null }).eq("id", rowId);
      await db.from("messages").insert({ type: "custom", recipient_phone: "community", body, provider: "wwebjs", status: "sent", sent_at: sentAt, provider_message_id: result.providerMessageId ?? null });
      return { posted: "sent" as const, variant };
    }
    // Worker offline → leave it queued; the drip delivers when it reconnects.
  }

  return { posted: outcome, variant };
}

type NextResult =
  | { message: { id: string; to: string; text: string } }
  | { message: null; reason: string };

// Worker calls this on each poll. Returns at most one message, only if the
// cautious policy allows right now; otherwise null + a reason.
export async function claimNextQueued(): Promise<NextResult> {
  const db = createAdminClient();

  // Admin kill switch (Settings → WhatsApp worker). Paused = drain nothing.
  if (await isWorkerPaused()) return { message: null, reason: "paused" };

  // Admin-tunable send schedule (Settings → Send schedule).
  const policy = await getSendPolicy();
  if (!withinWindow(policy.windowStartHour, policy.windowEndHour)) {
    return { message: null, reason: "outside-window" };
  }

  // Daily cap (MYT).
  const { count: sentToday } = await db
    .from("message_queue")
    .select("id", { count: "exact", head: true })
    .eq("status", "sent")
    .gte("sent_at", todayStartUtcISO());
  if ((sentToday ?? 0) >= policy.dailyCap) return { message: null, reason: "daily-cap" };

  // Minimum gap since the last send.
  const { data: last } = await db
    .from("message_queue")
    .select("sent_at")
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (last?.sent_at && Date.now() - new Date(last.sent_at).getTime() < policy.minGapMinutes * 60_000) {
    return { message: null, reason: "cooldown" };
  }

  // Irregularity: sometimes do nothing even when eligible.
  if (Math.random() < POLICY.randomSkipChance) return { message: null, reason: "random-skip" };

  // Pick a random queued row (shuffled order). When fee reminders are parked,
  // hold rows tied to an invoice — community posts / others still flow.
  const feePaused = await isFeeRemindersPaused();
  let q = db.from("message_queue").select("id, invoice_id, recipient_phone, body").eq("status", "queued");
  if (feePaused) q = q.is("invoice_id", null);
  const { data: queued } = await q.limit(25);
  if (!queued || queued.length === 0) return { message: null, reason: feePaused ? "empty-fees-paused" : "empty" };
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

  // Log shape depends on the queue row:
  //  • community notice (kind scorecard_community:*) → 'custom', recipient 'community'
  //  • scorecard row (scorecard_id)                 → 'scorecard'
  //  • otherwise                                    → 'payment_reminder' (invoice_id)
  const isCommunity = typeof row.recipient_phone === "string" && row.recipient_phone.endsWith("@g.us");
  const isScorecard = !isCommunity && !!row.scorecard_id;
  const logBase = isCommunity
    ? { type: "custom", recipient_phone: "community", body: row.body, provider: "wwebjs" }
    : {
        type: isScorecard ? "scorecard" : "payment_reminder",
        recipient_profile_id: row.recipient_profile_id,
        recipient_phone: row.recipient_phone,
        body: row.body,
        provider: "wwebjs",
        ...(isScorecard ? { scorecard_id: row.scorecard_id } : { invoice_id: row.invoice_id }),
      };

  if (status === "sent") {
    const sentAt = new Date().toISOString();
    await db
      .from("message_queue")
      .update({ status: "sent", sent_at: sentAt, provider_message_id: providerMessageId ?? null, error: null })
      .eq("id", id);
    await db.from("messages").insert({
      ...logBase,
      status: "sent",
      provider_message_id: providerMessageId ?? null,
      sent_at: sentAt,
    });
    // Reflect the send on the source record so the admin UI shows 'sent'.
    if (isScorecard) {
      await db.from("scorecards").update({ status: "sent" }).eq("id", row.scorecard_id);
    }
    return;
  }

  // Failed: retry a couple of times before giving up.
  const attempts = (row.attempts ?? 0) + 1;
  if (attempts < 3) {
    await db.from("message_queue").update({ status: "queued", attempts, error: error ?? null }).eq("id", id);
  } else {
    await db.from("message_queue").update({ status: "failed", attempts, error: error ?? null }).eq("id", id);
    await db.from("messages").insert({ ...logBase, status: "failed", error: error ?? null });
  }
}

// When a session is canceled, queue a WhatsApp heads-up to every enrolled
// student's parent. These rows have no invoice_id, so the worker sends them even
// while fee reminders are parked. One message per parent (siblings deduped).
// Returns how many were queued. Service-role client (RLS-bypassing).
export async function enqueueSessionCancelNotice(sessionId: string): Promise<number> {
  const db = createAdminClient();

  const { data: s } = await db
    .from("sessions")
    .select("id, class_id, session_date, start_time, end_time, classes(name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!s) return 0;

  const { data: enr } = await db
    .from("enrollments")
    .select("students(full_name, parent:profiles!students_parent_id_fkey(id, full_name, phone))")
    .eq("class_id", (s as any).class_id)
    .eq("active", true);

  const className = (s as any).classes?.name ?? "class";
  const when = `${formatDate((s as any).session_date)} (${formatTime((s as any).start_time)}–${formatTime((s as any).end_time)})`;

  const rows: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  for (const e of (enr ?? []) as any[]) {
    const parent = e.students?.parent;
    const phone = normalizePhoneMY(parent?.phone);
    if (!phone || seen.has(phone)) continue;
    seen.add(phone);
    rows.push({
      kind: "session_canceled",
      recipient_profile_id: parent?.id ?? null,
      recipient_phone: phone,
      body:
        `🏸 ${APP_NAME}\n` +
        `Hi ${parent?.full_name ?? "there"}, the ${className} session on ${when} has been CANCELLED. ` +
        `Sorry for the inconvenience — we'll see you at the next session!`,
    });
  }

  if (rows.length) await db.from("message_queue").insert(rows);
  return rows.length;
}
