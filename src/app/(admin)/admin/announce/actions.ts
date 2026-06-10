"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
