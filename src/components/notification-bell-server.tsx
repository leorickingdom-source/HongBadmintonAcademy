import { getProfile } from "@/lib/auth";
import { getParentProfile } from "@/lib/parent-auth";
import { listNotifications, unreadCount } from "@/lib/notifications";
import { NotificationBell } from "@/components/notification-bell";

// Resolves the current user (staff via Supabase session, else parent via the
// signed cookie), fetches their feed, and renders the client bell. Rendered
// inside the shared AppShell so all three roles get it.
export async function NotificationBellServer() {
  const staff = await getProfile();
  const profile = staff ?? (await getParentProfile());
  if (!profile) return null;

  try {
    const [items, unread] = await Promise.all([
      listNotifications(profile.id, 20),
      unreadCount(profile.id),
    ]);
    const muted = Boolean((profile as { notifications_muted?: boolean }).notifications_muted);
    return <NotificationBell items={items} unread={unread} muted={muted} />;
  } catch {
    // Table not migrated yet (deploy ordering) — show an empty bell, don't crash.
    return <NotificationBell items={[]} unread={0} muted={false} />;
  }
}
