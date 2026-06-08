import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

// Service-role client. BYPASSES RLS — server-only. Used by NFC ingest, the
// Stripe webhook, cron jobs, scorecard/message workers, and admin user creation.
export function createAdminClient() {
  return createClient(env.supabaseUrl, env.supabaseServiceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
