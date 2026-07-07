"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole, requireSuperAdmin } from "@/lib/auth";
import { getWhatsappProvider } from "@/lib/whatsapp";
import { setCommunityIntro } from "@/lib/settings";
import { pushToUsers } from "@/lib/push";
import { createNotifications } from "@/lib/notifications";
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

// Super-admin only: one-tap web-push to every parent inviting them to the
// WhatsApp group. This is the lazy-parent lever — it lands on their phone
// (parents rarely open the app), and the tap deep-links straight to the
// chat.whatsapp.com invite (the service worker opens it → WhatsApp).
//
// Zero ban risk: it's web push, NOT a WhatsApp DM (unlike DMs, push is opt-in,
// free, and invisible to Meta). Send SPARINGLY — we can't detect who already
// joined, so it goes to every parent each time.
export async function inviteParentsToCommunity() {
  await requireSuperAdmin();
  if (!env.waCommunityLink) {
    redirect(`/admin/announce?error=${encodeURIComponent("Set WA_COMMUNITY_LINK in Vercel first — no invite link to send.")}`);
  }

  const db = createAdminClient();
  const { data: parents } = await db.from("profiles").select("id").eq("role", "parent");
  const ids = (parents ?? []).map((p: { id: string }) => p.id);
  if (!ids.length) {
    redirect(`/admin/announce?error=${encodeURIComponent("No parents to invite yet.")}`);
  }

  const title = "📢 Join our parent WhatsApp group";
  const body = "Class updates, reminders & announcements — tap to join.";
  const res = await pushToUsers(ids, { title, body, url: env.waCommunityLink, tag: "community-invite" });
  // In-app bell fallback for parents who don't have push enabled.
  await createNotifications(ids, { type: "community", title, body, url: env.waCommunityLink });

  redirect(`/admin/announce?invited=${res.sent}&parents=${ids.length}`);
}

// Save the free-text note prepended to the monthly Community notice (reports/fees).
export async function saveCommunityIntro(formData: FormData) {
  await requireRole("admin");
  const text = String(formData.get("text") ?? "").trim();
  await setCommunityIntro(text);
  revalidatePath("/admin/announce");
  redirect(`/admin/announce?intro=${text ? "saved" : "cleared"}`);
}
