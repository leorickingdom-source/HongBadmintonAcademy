import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { materializeSessions } from "@/lib/sessions";
import { getAutoSessions } from "@/lib/settings";
import { isAuthorizedCron } from "@/lib/cron";

export const runtime = "nodejs";
export const maxDuration = 60;

// Runs DAILY (see vercel.json). When auto-sessions is enabled (Settings), keeps
// every active class's sessions filled a rolling `horizonDays` ahead from its
// weekly schedule. Idempotent upsert — re-running never duplicates. No-op when
// disabled. Service-role client, CRON_SECRET-gated.
export async function GET(req: NextRequest) {
  if (!isAuthorizedCron(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const cfg = await getAutoSessions();
    if (!cfg.enabled) {
      return NextResponse.json({ ok: true, skipped: "disabled" });
    }
    const db = createAdminClient();
    const result = await materializeSessions(db, { horizonDays: cfg.horizonDays });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
