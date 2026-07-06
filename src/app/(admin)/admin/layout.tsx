import { requireRole } from "@/lib/auth";
import { listBranches, getViewBranchId } from "@/lib/branch";
import { AppShell } from "@/components/app-shell";
import { BranchSwitcher } from "@/components/branch-switcher";
import { LangToggle } from "@/components/lang-toggle";
import { toggleStaffLocale } from "@/app/staff-locale-actions";
import { CommandPalette } from "@/components/command-palette";
import { NotificationBellServer } from "@/components/notification-bell-server";
import { ADMIN_NAV } from "@/lib/constants";
import { dict } from "@/lib/i18n";
import { setBranchView } from "./branches/actions";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("admin");
  const L = dict(profile.locale);
  // Branch-admins don't see super-only items (branches, staff, settings, fee
  // plans); empty groups (e.g. Organization) drop out entirely.
  const isSuper = profile.role === "super_admin";
  const groups = ADMIN_NAV
    .map((g) => ({ ...g, items: g.items.filter((i) => isSuper || !i.superOnly) }))
    .filter((g) => g.items.length > 0);

  // Super-admins get a branch focus switcher; branch-admins are locked to theirs.
  const switcher = isSuper
    ? <BranchSwitcher branches={await listBranches()} current={await getViewBranchId(profile)} action={setBranchView} />
    : undefined;

  return (
    <AppShell
      groups={groups}
      role={profile.role}
      name={profile.full_name ?? profile.email ?? "Admin"}
      accountHref="/admin/account"
      bell={<NotificationBellServer />}
      switcher={switcher}
      langToggle={<LangToggle locale={profile.locale} action={toggleStaffLocale} />}
      labels={{ dashboard: L.dashboard, account: L.account, home: L.home }}
    >
      <CommandPalette />
      {children}
    </AppShell>
  );
}
