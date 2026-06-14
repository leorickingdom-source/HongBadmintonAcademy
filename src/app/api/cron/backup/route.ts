import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runDatabaseBackup } from "@/lib/backup";
import { env } from "@/lib/env";

export const runtime = "nodejs";
// Reads every table into one JSON file — give it room past the short serverless
// default (60s is the Hobby cap; raise on Pro if the dataset grows large).
export const maxDuration = 60;

// Daily Vercel Cron (see vercel.json): writes a JSON snapshot of every public
// table to the private `backups` storage bucket. Runs headless with the
// service-role client (no user session). Secured by CRON_SECRET, which Vercel
// sends as a Bearer header on scheduled invocations.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = auth === `Bearer ${env.cronSecret}` || secret === env.cronSecret;
  if (!env.cronSecret || !ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const result = await runDatabaseBackup(createAdminClient());
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
