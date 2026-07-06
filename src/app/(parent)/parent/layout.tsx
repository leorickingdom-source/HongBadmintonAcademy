import { requireParent } from "@/lib/parent-auth";
import { AppShell } from "@/components/app-shell";
import { NotificationBellServer } from "@/components/notification-bell-server";
import { LangToggle } from "@/components/lang-toggle";
import { toggleParentLocale } from "./account/locale-actions";
import { dict } from "@/lib/i18n";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireParent();
  const L = dict(profile.locale);
  // Parent nav is built here (not from the static PARENT_NAV) so the labels
  // follow the parent's language.
  const items = [
    { href: "/parent/children", label: L.my_children },
    { href: "/parent/schedule", label: L.schedule },
    { href: "/parent/scorecards", label: L.progress_card },
    { href: "/parent/invoices", label: L.fees_payments },
  ];
  return (
    <AppShell
      groups={[{ group: "Parent", items }]}
      role={profile.role}
      name={profile.full_name ?? profile.email ?? "Parent"}
      accountHref="/parent/account"
      bell={<NotificationBellServer />}
      langToggle={<LangToggle locale={profile.locale} action={toggleParentLocale} />}
      labels={{ dashboard: L.dashboard, account: L.account, home: L.home }}
    >
      {children}
    </AppShell>
  );
}
