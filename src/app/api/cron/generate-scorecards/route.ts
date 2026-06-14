import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateScorecardsCore } from "@/lib/scorecards";
import { env } from "@/lib/env";

export const runtime = "nodejs";
// Loops all active students and renders a PDF each — give it room past the
// short serverless default (60s is the Hobby cap; raise on Pro if the roster
// grows large enough to need it).
export const maxDuration = 60;

// Monthly Vercel Cron (see vercel.json): auto-generates the *previous* month's
// Monthly Growth Report PDF for every active student. Runs headless with the
// service-role client (no user session). Secured by CRON_SECRET, which Vercel
// sends as a Bearer header on scheduled invocations.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = auth === `Bearer ${env.cronSecret}` || secret === env.cronSecret;
  if (!env.cronSecret || !ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Cron fires early in the new month; report on the month that just ended.
  const now = new Date();
  const prevMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

  const db = createAdminClient();
  try {
    const result = await generateScorecardsCore(db, db, prevMonth);
    const label = `${prevMonth.getFullYear()}-${String(prevMonth.getMonth() + 1).padStart(2, "0")}`;
    return NextResponse.json({ ok: true, month: label, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
