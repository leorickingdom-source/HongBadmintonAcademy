import "server-only";
import { env, isWaWorkerConfigured } from "@/lib/env";
import { getResolvedWaWorkerUrl } from "@/lib/settings";
import type { SendInput, SendResult, WhatsappProvider } from "./types";

// whatsapp-web.js worker provider. Sends are forwarded to a separate always-on
// Node service (see /wa-worker) that drives a real WhatsApp account over
// WhatsApp Web. UNOFFICIAL: the connected number can be banned by Meta — use a
// dedicated SIM. When the worker isn't configured this is a no-op stub so the
// message log still works in dev.
export const wwebjsProvider: WhatsappProvider = {
  id: "wwebjs",

  async send(input: SendInput): Promise<SendResult> {
    if (!isWaWorkerConfigured()) {
      return {
        status: "failed",
        error: "Dev stub: WA_WORKER_URL/WA_WORKER_SECRET not set — message not sent.",
      };
    }

    // wwebjs sends free-form session text; templates are a Meta-only concept, so
    // fall back to joined body params if only those were supplied.
    const text = input.text ?? input.bodyParams?.join(" ") ?? "";

    // Live URL: the worker's self-registered tunnel URL (falls back to env).
    const workerUrl = await getResolvedWaWorkerUrl();
    if (!workerUrl) return { status: "failed", error: "worker URL not set" };

    try {
      const res = await fetch(`${workerUrl}/send`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${env.waWorkerSecret}`,
        },
        body: JSON.stringify({ to: input.to, text }),
        // The worker resolves the number against WhatsApp before sending; cap the
        // wait so a stuck worker can't hang the server action indefinitely.
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
  },
};
