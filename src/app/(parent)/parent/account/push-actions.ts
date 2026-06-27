"use server";

import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { pushToUsers, isPushConfigured } from "@/lib/push";

type SubInput = { endpoint: string; p256dh: string; auth: string; user_agent?: string };

// Parents have no Supabase session, so their subscription is saved via the
// service-role client, scoped to the cookie-resolved profile id.
export async function saveParentPush(input: SubInput): Promise<{ ok: boolean; error?: string }> {
  if (!input?.endpoint || !input?.p256dh || !input?.auth) return { ok: false, error: "missing fields" };
  const me = await requireParent();
  const db = createAdminClient();
  const { error } = await db.from("push_subscriptions").upsert(
    {
      user_id: me.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.user_agent ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function removeParentPush(endpoint: string): Promise<{ ok: boolean; error?: string }> {
  if (!endpoint) return { ok: false, error: "missing endpoint" };
  const me = await requireParent();
  const db = createAdminClient();
  const { error } = await db.from("push_subscriptions").delete().eq("endpoint", endpoint).eq("user_id", me.id);
  return error ? { ok: false, error: error.message } : { ok: true };
}

export async function sendTestParentPush(): Promise<{ ok: boolean; sent: number; failed: number; error?: string }> {
  if (!isPushConfigured()) return { ok: false, sent: 0, failed: 0, error: "Push isn't set up yet." };
  const me = await requireParent();
  const r = await pushToUsers([me.id], {
    title: "Hong Badminton Academy",
    body: "Notifications are on — you'll get exam results and fee reminders here.",
    url: "/parent",
    tag: "hba-test",
  });
  return {
    ok: r.sent > 0,
    sent: r.sent,
    failed: r.failed,
    error: r.sent > 0 ? undefined : "No device subscribed yet — tap Enable first.",
  };
}
