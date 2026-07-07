import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

const WORKER_PAUSED = "worker_paused";
const FEE_REMINDERS_PAUSED = "fee_reminders_paused";
const SEND_POLICY = "send_policy";
const MONTHLY_SCHEDULE = "monthly_schedule";
const REQUIRE_2FA = "require_2fa";
const WA_WORKER_URL = "wa_worker_url";

// Generic app_settings value store. Read via the service-role client so
// worker/cron endpoints (no user session) can read it.
async function getValue<T>(key: string, fallback: T): Promise<T> {
  const db = createAdminClient();
  const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  return (data?.value ?? fallback) as T;
}

async function setValue(key: string, value: unknown): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

// Whole WhatsApp drip worker: paused = drain nothing at all.
export const isWorkerPaused = () => getValue(WORKER_PAUSED, false);
export const setWorkerPaused = (v: boolean) => setValue(WORKER_PAUSED, v);

// When true, every staff member must have 2FA enabled — those without it are
// forced into enrollment before they can use the app.
export const is2faRequired = () => getValue(REQUIRE_2FA, false);
export const set2faRequired = (v: boolean) => setValue(REQUIRE_2FA, v);

// Auto fee reminders only: paused = stop queuing new ones AND hold any already
// queued (worker still sends community posts etc.).
//
// Default = TRUE (parked) to match proposal v7 §6 Option A: WhatsApp Community
// broadcasts + PWA self-service, no individual auto-DMs to parents. Admin can
// resume from Settings if the academy wants Option C behaviour.
export const isFeeRemindersPaused = () => getValue(FEE_REMINDERS_PAUSED, true);
export const setFeeRemindersPaused = (v: boolean) => setValue(FEE_REMINDERS_PAUSED, v);

// Admin-tunable send schedule (the worker reads this each poll). Hours are MYT,
// 0–23; window is [start, end) so end=20 means last send by 19:59.
export type SendPolicy = {
  windowStartHour: number;
  windowEndHour: number;
  dailyCap: number;
  minGapMinutes: number;
};

export const DEFAULT_SEND_POLICY: SendPolicy = {
  windowStartHour: 9,
  windowEndHour: 20,
  dailyCap: 10,
  minGapMinutes: 10,
};

export async function getSendPolicy(): Promise<SendPolicy> {
  const v = await getValue<Partial<SendPolicy>>(SEND_POLICY, {});
  return { ...DEFAULT_SEND_POLICY, ...v };
}

export const setSendPolicy = (p: SendPolicy) => setValue(SEND_POLICY, p);

// Day of the month each monthly run fires (1–28, kept ≤28 so it always exists).
// `runDay` = the one day invoices AND growth reports are generated (they produce
// a single combined Community post). `dueDay` = when the fee falls due.
export type MonthlySchedule = {
  runDay: number;
  dueDay: number;
};

export const DEFAULT_MONTHLY_SCHEDULE: MonthlySchedule = {
  runDay: 1,
  dueDay: 7,
};

export async function getMonthlySchedule(): Promise<MonthlySchedule> {
  // Back-compat: older stored values used invoiceDay/reportDay.
  const v = await getValue<Partial<MonthlySchedule> & { invoiceDay?: number; reportDay?: number }>(MONTHLY_SCHEDULE, {});
  return {
    runDay: v.runDay ?? v.invoiceDay ?? DEFAULT_MONTHLY_SCHEDULE.runDay,
    dueDay: v.dueDay ?? DEFAULT_MONTHLY_SCHEDULE.dueDay,
  };
}

export const setMonthlySchedule = (s: MonthlySchedule) => setValue(MONTHLY_SCHEDULE, s);

// Admin's free-text line prepended to the monthly Community notice (reports/fees),
// so it goes out as one personalised post. Empty = just the auto summary.
const COMMUNITY_INTRO = "community_notice_intro";
export const getCommunityIntro = () => getValue<string>(COMMUNITY_INTRO, "");
export const setCommunityIntro = (v: string) => setValue(COMMUNITY_INTRO, v);

// Live WhatsApp-worker URL. The worker self-registers its current public tunnel
// URL here on every boot (POST /api/worker/register-url), so an ephemeral tunnel
// URL that changes on each restart never needs a Vercel env edit. Falls back to
// the WA_WORKER_URL env var when nothing is registered yet. The env var still
// gates provider selection (isWaWorkerConfigured) + acts as the fallback.
export const setWaWorkerUrl = (v: string) => setValue(WA_WORKER_URL, v);
export async function getResolvedWaWorkerUrl(): Promise<string> {
  const override = await getValue<string>(WA_WORKER_URL, "");
  return (override || env.waWorkerUrl || "").replace(/\/$/, "");
}

// Day-of-month in Malaysia time (1–31) — for cron gating against the schedule.
export function mytDayOfMonth(): number {
  return Number(new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(8, 10));
}
