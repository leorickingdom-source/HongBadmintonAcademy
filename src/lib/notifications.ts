import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// In-app notification feed (the bell). Outbound push is unchanged — these rows
// power the in-app dropdown for admin / coach / parent. All writes use the
// service-role client; recipients are always resolved server-side by callers.

export type NotifInput = {
  type: string;
  title: string;
  body?: string | null;
  url?: string | null;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  url: string | null;
  read_at: string | null;
  created_at: string;
};

// Insert one notification per recipient. Skips anyone who muted notifications.
export async function createNotifications(
  profileIds: (string | null | undefined)[],
  n: NotifInput,
): Promise<void> {
  const ids = [...new Set(profileIds.filter((x): x is string => !!x))];
  if (!ids.length) return;
  // Best-effort: an in-app notification must never break the core flow that
  // triggered it (billing, cron, payments) — swallow any failure.
  try {
    const db = createAdminClient();

    const { data: muted } = await db
      .from("profiles")
      .select("id")
      .in("id", ids)
      .eq("notifications_muted", true);
    const mutedSet = new Set((muted ?? []).map((m: { id: string }) => m.id));

    const rows = ids
      .filter((id) => !mutedSet.has(id))
      .map((id) => ({
        recipient_profile_id: id,
        type: n.type,
        title: n.title,
        body: n.body ?? null,
        url: n.url ?? null,
      }));
    if (rows.length) await db.from("notifications").insert(rows);
  } catch {
    // ignore
  }
}

// Notify every admin (e.g. an online payment landed).
export async function notifyAdmins(n: NotifInput): Promise<void> {
  const db = createAdminClient();
  const { data } = await db.from("profiles").select("id").eq("role", "admin");
  await createNotifications((data ?? []).map((p: { id: string }) => p.id), n);
}

// Notify the coach(es) who own a class (lead coach + assigned coaches).
export async function notifyCoachesOfClass(classId: string, n: NotifInput): Promise<void> {
  if (!classId) return;
  const db = createAdminClient();
  const [{ data: owner }, { data: assigned }] = await Promise.all([
    db.from("classes").select("coach_id").eq("id", classId).maybeSingle(),
    db.from("class_coaches").select("coach_id").eq("class_id", classId),
  ]);
  const ids = [
    (owner as { coach_id: string | null } | null)?.coach_id,
    ...((assigned ?? []) as { coach_id: string }[]).map((c) => c.coach_id),
  ];
  await createNotifications(ids, n);
}

export async function listNotifications(profileId: string, limit = 20): Promise<Notification[]> {
  const db = createAdminClient();
  const { data } = await db
    .from("notifications")
    .select("id, type, title, body, url, read_at, created_at")
    .eq("recipient_profile_id", profileId)
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data ?? []) as Notification[];
}

export async function unreadCount(profileId: string): Promise<number> {
  const db = createAdminClient();
  const { count } = await db
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("recipient_profile_id", profileId)
    .is("read_at", null);
  return count ?? 0;
}

export async function markAllRead(profileId: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_profile_id", profileId)
    .is("read_at", null);
}

export async function markRead(profileId: string, id: string): Promise<void> {
  const db = createAdminClient();
  await db
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", id)
    .eq("recipient_profile_id", profileId);
}

export async function setMuted(profileId: string, muted: boolean): Promise<void> {
  const db = createAdminClient();
  await db.from("profiles").update({ notifications_muted: muted }).eq("id", profileId);
}
