import "server-only";
import { env, isWhatsappConfigured } from "@/lib/env";
import type { SendInput, SendResult, WhatsappProvider } from "./types";

// Meta WhatsApp Cloud API. When no token is configured (dev), sending is a
// no-op stub so the message log + delivery-status pipeline still works.
export const metaProvider: WhatsappProvider = {
  id: "meta_cloud",

  async send(input: SendInput): Promise<SendResult> {
    if (!isWhatsappConfigured()) {
      return {
        status: "failed",
        error: "Dev stub: WHATSAPP_API_TOKEN not set — message not sent.",
      };
    }

    const url = `https://graph.facebook.com/${env.whatsappApiVersion}/${env.whatsappPhoneId}/messages`;
    const to = input.to.replace(/[^\d]/g, ""); // Cloud API wants digits only

    const payload = input.templateName
      ? {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: input.templateName,
            language: { code: input.languageCode ?? "en" },
            components: input.bodyParams?.length
              ? [
                  {
                    type: "body",
                    parameters: input.bodyParams.map((t) => ({ type: "text", text: t })),
                  },
                ]
              : undefined,
          },
        }
      : {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: input.text ?? "" },
        };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${env.whatsappToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      const json = (await res.json()) as {
        messages?: { id: string }[];
        error?: { message: string };
      };
      if (!res.ok) {
        return { status: "failed", error: json.error?.message ?? `HTTP ${res.status}` };
      }
      return { status: "sent", providerMessageId: json.messages?.[0]?.id };
    } catch (e) {
      return { status: "failed", error: (e as Error).message };
    }
  },
};
