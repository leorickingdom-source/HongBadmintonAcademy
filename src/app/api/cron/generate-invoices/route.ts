import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateInvoicesCore } from "@/lib/billing";
import { upsertCommunityMonthlyNotice } from "@/lib/reminders";
import { getMonthlySchedule, mytDayOfMonth } from "@/lib/settings";
import { getBaseUrl } from "@/lib/url";
import { env } from "@/lib/env";

export const runtime = "nodejs";
export const maxDuration = 60;

// Runs DAILY (see vercel.json) but only acts on the admin-set billing day
// (Settings → Monthly schedule). Raises this month's fee invoice for every
// active student on a monthly plan, then posts the combined Community notice.
// Service-role client, CRON_SECRET-gated.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = auth === `Bearer ${env.cronSecret}` || secret === env.cronSecret;
  if (!env.cronSecret || !ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const schedule = await getMonthlySchedule();
    const today = mytDayOfMonth();
    if (today !== schedule.runDay) {
      return NextResponse.json({ ok: true, skipped: "not-run-day", today, runDay: schedule.runDay });
    }
    const result = await generateInvoicesCore(createAdminClient(), new Date(), schedule.dueDay);
    // Combined "reports + fees" Community notice (or one-sided fallback).
    const notice = await upsertCommunityMonthlyNotice(await getBaseUrl());
    return NextResponse.json({ ok: true, ...result, notice });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
