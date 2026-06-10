"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { announceToCommunity } from "@/lib/whatsapp/community";
import { env } from "@/lib/env";

export async function postAnnouncement(formData: FormData) {
  const text = String(formData.get("text") ?? "").trim();
  if (!text) {
    redirect("/admin/announce?error=" + encodeURIComponent("Write a message first."));
  }

  const result = await announceToCommunity(text);

  // Logged as a 'custom' message (the message_type enum has no 'announcement');
  // provider 'wwebjs' marks it as a community post in the WhatsApp Log.
  const supabase = await createClient();
  await supabase.from("messages").insert({
    type: "custom",
    recipient_phone: env.waCommunityGroupId || "community",
    body: text,
    provider: "wwebjs",
    status: result.status === "sent" ? "sent" : "failed",
    provider_message_id: result.providerMessageId ?? null,
    error: result.error ?? null,
    sent_at: result.status === "sent" ? new Date().toISOString() : null,
  });

  revalidatePath("/admin/announce");
  if (result.status !== "sent") {
    redirect("/admin/announce?error=" + encodeURIComponent(result.error ?? "Send failed."));
  }
  redirect("/admin/announce?sent=1");
}
