import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { env, isWaWorkerConfigured } from "@/lib/env";
import { getResolvedWaWorkerUrl } from "@/lib/settings";

export const runtime = "nodejs";

// Admin-only: proxy the worker's QR so the web app can show it in Settings for
// (re)linking. The worker secret stays server-side, and fetching server→worker
// avoids the HTTPS-page-loading-HTTP-worker mixed-content block in the browser.
export async function GET() {
  const profile = await getProfile();
  if (!profile || profile.role !== "admin" && profile.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isWaWorkerConfigured()) {
    return NextResponse.json({ configured: false, ready: false, dataUrl: null });
  }
  try {
    const workerUrl = await getResolvedWaWorkerUrl();
    const r = await fetch(`${workerUrl}/qr.json`, {
      headers: { Authorization: `Bearer ${env.waWorkerSecret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const j = await r.json().catch(() => ({}));
    return NextResponse.json({ configured: true, ready: !!j.ready, dataUrl: j.dataUrl ?? null });
  } catch {
    return NextResponse.json({ configured: true, ready: false, dataUrl: null, error: "worker unreachable" });
  }
}
