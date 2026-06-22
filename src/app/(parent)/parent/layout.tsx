import { requireParent } from "@/lib/parent-auth";
import { AppShell } from "@/components/app-shell";
import { NotificationBellServer } from "@/components/notification-bell-server";
import { PARENT_NAV } from "@/lib/constants";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireParent();
  return (
    <AppShell
      groups={[{ group: "Parent", items: PARENT_NAV }]}
      role={profile.role}
      name={profile.full_name ?? profile.email ?? "Parent"}
      accountHref="/parent/account"
      bell={<NotificationBellServer />}
    >
      {children}
    </AppShell>
  );
}
