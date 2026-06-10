import "server-only";
import { env, isWaWorkerConfigured } from "@/lib/env";

export interface AnnounceResult {
  status: "sent" | "failed";
  providerMessageId?: string;
  error?: string;
}

// Post one message to the parent WhatsApp Community Announcements group via the
// worker's /announce endpoint. One send → every parent reads it; no per-parent
// blast, no number scraping, far below the ban radar. The worker holds (or the
// app passes) the group id; the dedicated number must be an admin of the group.
export async function announceToCommunity(text: string): Promise<AnnounceResult> {
  if (!isWaWorkerConfigured()) {
    return {
      status: "failed",
      error: "WA worker not configured (WA_WORKER_URL/WA_WORKER_SECRET).",
    };
  }

  try {
    const res = await fetch(`${env.waWorkerUrl.replace(/\/$/, "")}/announce`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.waWorkerSecret}`,
      },
      body: JSON.stringify({
        text,
        // Optional — when unset the worker falls back to its own env value.
        groupId: env.waCommunityGroupId || undefined,
      }),
      signal: AbortSignal.timeout(20_000),
    });

    const json = (await res.json().catch(() => ({}))) as {
      status?: string;
      providerMessageId?: string;
      error?: string;
    };

    if (!res.ok || json.status !== "sent") {
      return { status: "failed", error: json.error ?? `HTTP ${res.status}` };
    }
    return { status: "sent", providerMessageId: json.providerMessageId };
  } catch (e) {
    return { status: "failed", error: (e as Error).message };
  }
}
