"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendPush, isPushConfigured } from "@/lib/push";

interface SubscribeInput {
  endpoint: string;
  p256dh: string;
  auth: string;
  user_agent?: string;
}

export async function savePushSubscription(
  input: SubscribeInput,
): Promise<{ ok: boolean; error?: string }> {
  if (!input?.endpoint || !input?.p256dh || !input?.auth) {
    return { ok: false, error: "missing fields" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "not signed in" };

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      user_agent: input.user_agent ?? null,
      last_used_at: new Date().toISOString(),
    },
    { onConflict: "endpoint" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

export async function removePushSubscription(
  endpoint: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!endpoint) return { ok: false, error: "missing endpoint" };
  const supabase = await createClient();
  const { error } = await supabase
    .from("push_subscriptions")
    .delete()
    .eq("endpoint", endpoint);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/settings");
  return { ok: true };
}

// Sends a test push to every subscription belonging to the calling user.
export async function sendTestPushToSelf(): Promise<{
  ok: boolean;
  sent: number;
  failed: number;
  error?: string;
}> {
  if (!isPushConfigured()) {
    return { ok: false, sent: 0, failed: 0, error: "VAPID env vars not set in Vercel" };
  }
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, sent: 0, failed: 0, error: "not signed in" };

  const { data: subs } = await supabase
    .from("push_subscriptions")
    .select("endpoint, p256dh, auth")
    .eq("user_id", user.id);

  if (!subs || subs.length === 0) {
    return { ok: false, sent: 0, failed: 0, error: "no subscriptions — tap Enable first" };
  }

  let sent = 0;
  let failed = 0;
  const toDelete: string[] = [];
  for (const s of subs) {
    const r = await sendPush(s as any, {
      title: "Hong Badminton Academy",
      body: "Test push from your admin account. Notifications are working.",
      url: "/admin",
      tag: "hba-test",
    });
    if (r.ok) sent++;
    else {
      failed++;
      if (r.gone) toDelete.push(s.endpoint);
    }
  }
  if (toDelete.length) {
    await supabase.from("push_subscriptions").delete().in("endpoint", toDelete);
  }
  return { ok: sent > 0, sent, failed };
}
