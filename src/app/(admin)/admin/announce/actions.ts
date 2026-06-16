"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { getWhatsappProvider } from "@/lib/whatsapp";
import { env } from "@/lib/env";

// No worker, no bot: the admin posts the notice into the community Announcements
// group in WhatsApp by hand (one post, every parent sees it). This just records
// that a post was made so the history / WhatsApp Log stay accurate. Logged as a
// 'custom' message (the message_type enum has no 'announcement'); recipient is
// the community, not a phone number.
export async function logAnnouncement(formData: FormData) {
  const body = String(formData.get("text") ?? "").trim();
  if (!body) return;

  const supabase = await createClient();
  await supabase.from("messages").insert({
    type: "custom",
    recipient_phone: "community",
    body,
    provider: "wa_click",
    status: "sent",
    sent_at: new Date().toISOString(),
  });

  revalidatePath("/admin/announce");
}

// Community blast: post a free-text notice to the parent Community Announcements
// group. One message reaches every parent at once, so it's sent IMMEDIATELY (via
// the worker's /send) rather than parked in the throttled per-parent drip — a
// single group post carries little ban risk. If the worker is offline we fall
// back to the queue so it goes out when the worker reconnects. Admin-only.
export async function postCommunityMessage(formData: FormData) {
  await requireRole("admin");
  const body = String(formData.get("text") ?? "").trim();
  if (!body) redirect(`/admin/announce?error=${encodeURIComponent("Message can't be empty")}`);
  if (!env.waCommunityGroupId) {
    redirect(`/admin/announce?error=${encodeURIComponent("No Community group configured (set WA_COMMUNITY_GROUP_ID)")}`);
  }

  const db = createAdminClient();
  const result = await getWhatsappProvider().send({ to: env.waCommunityGroupId, text: body });

  if (result.status === "sent") {
    await db.from("messages").insert({
      type: "custom",
      recipient_phone: "community",
      body,
      provider: "wwebjs",
      status: "sent",
      sent_at: new Date().toISOString(),
      provider_message_id: result.providerMessageId ?? null,
    });
    revalidatePath("/admin/announce");
    redirect("/admin/announce?posted=1");
  }

  // Worker offline / not ready → queue it; the drip delivers when it reconnects.
  await db.from("message_queue").insert({ kind: "community_custom", recipient_phone: env.waCommunityGroupId, body });
  revalidatePath("/admin/announce");
  redirect("/admin/announce?posted=queued");
}
