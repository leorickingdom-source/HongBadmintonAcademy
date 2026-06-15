import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { getBaseUrl } from "@/lib/url";
import { enqueueDueReminders } from "@/lib/reminders";

export const runtime = "nodejs";

// Daily Vercel Cron (see vercel.json): queues fee reminders for invoices due in
// 3 days or due today and still unpaid. The worker drip-sends them. Secured by
// CRON_SECRET (Vercel sends it as a Bearer header on scheduled invocations).
export async function GET(req: NextRequest) {
  const auth = req.headers.get("authorization");
  const secret = req.nextUrl.searchParams.get("secret");
  const ok = auth === `Bearer ${env.cronSecret}` || secret === env.cronSecret;
  if (!env.cronSecret || !ok) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const baseUrl = await getBaseUrl();
    const result = await enqueueDueReminders(baseUrl);
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
