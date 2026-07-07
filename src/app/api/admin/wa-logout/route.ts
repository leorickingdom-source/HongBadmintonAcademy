import { NextResponse } from "next/server";
import { getProfile } from "@/lib/auth";
import { env, isWaWorkerConfigured } from "@/lib/env";

export const runtime = "nodejs";

// Super-admin only: tell the worker to log the current WhatsApp number out, so a
// new super admin can link their own number by scanning the fresh QR that comes
// back. Destructive (sending stops until re-linked) → super_admin, not admin.
export async function POST() {
  const profile = await getProfile();
  if (!profile || profile.role !== "super_admin") {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isWaWorkerConfigured()) {
    return NextResponse.json({ error: "worker not configured" }, { status: 400 });
  }
  try {
    const r = await fetch(`${env.waWorkerUrl.replace(/\/$/, "")}/logout`, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.waWorkerSecret}` },
      cache: "no-store",
      signal: AbortSignal.timeout(15000),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j.status === "failed") {
      return NextResponse.json({ error: j.error || "logout failed" }, { status: 502 });
    }
    return NextResponse.json({ status: "ok" });
  } catch {
    return NextResponse.json({ error: "worker unreachable" }, { status: 502 });
  }
}
