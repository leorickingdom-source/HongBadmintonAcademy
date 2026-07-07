import { NextResponse } from "next/server";
import { env } from "@/lib/env";
import { setWaWorkerUrl } from "@/lib/settings";

export const runtime = "nodejs";

// The worker calls this on every boot with its current public tunnel URL,
// authenticating with the shared WA_WORKER_SECRET. We store it in app_settings
// so the app always talks to the worker's live URL — even when an ephemeral
// tunnel (cloudflare quick tunnel) hands out a new URL on each restart. No
// Vercel env edit, no redeploy.
export async function POST(req: Request) {
  const auth = req.headers.get("authorization");
  if (!env.waWorkerSecret || auth !== `Bearer ${env.waWorkerSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const url = String((body as { url?: string })?.url ?? "").trim();
  if (!/^https:\/\/[^\s]+$/i.test(url)) {
    return NextResponse.json({ error: "invalid url (must be https)" }, { status: 400 });
  }
  await setWaWorkerUrl(url.replace(/\/$/, ""));
  return NextResponse.json({ status: "ok", url: url.replace(/\/$/, "") });
}
