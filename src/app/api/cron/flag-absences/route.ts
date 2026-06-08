import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Scheduled sweep (Vercel Cron): finalises finished sessions — marks late
// tap-ins and inserts absent rows for no-shows. See vercel.json.
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = auth === `Bearer ${env.cronSecret}` || secret === env.cronSecret;
  if (!env.cronSecret || !ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const db = createAdminClient();
  const { data, error } = await db.rpc("flag_due_absences");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, sessions_processed: data });
}
