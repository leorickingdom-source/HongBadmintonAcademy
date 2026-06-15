import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

const WORKER_PAUSED = "worker_paused";
const FEE_REMINDERS_PAUSED = "fee_reminders_paused";

// Generic boolean flag store (app_settings). Read via the service-role client so
// worker/cron endpoints (no user session) can check it. Defaults to false.
async function getFlag(key: string): Promise<boolean> {
  const db = createAdminClient();
  const { data } = await db.from("app_settings").select("value").eq("key", key).maybeSingle();
  return data?.value === true;
}

async function setFlag(key: string, value: boolean): Promise<void> {
  const db = createAdminClient();
  const { error } = await db
    .from("app_settings")
    .upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw new Error(error.message);
}

// Whole WhatsApp drip worker: paused = drain nothing at all.
export const isWorkerPaused = () => getFlag(WORKER_PAUSED);
export const setWorkerPaused = (v: boolean) => setFlag(WORKER_PAUSED, v);

// Auto fee reminders only: paused = stop queuing new ones AND hold any already
// queued (worker still sends community posts etc.).
export const isFeeRemindersPaused = () => getFlag(FEE_REMINDERS_PAUSED);
export const setFeeRemindersPaused = (v: boolean) => setFlag(FEE_REMINDERS_PAUSED, v);
