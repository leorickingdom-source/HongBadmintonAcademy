import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { NotificationBellServer } from "@/components/notification-bell-server";
import { LangToggle } from "@/components/lang-toggle";
import { toggleStaffLocale } from "@/app/staff-locale-actions";
import { dict } from "@/lib/i18n";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("coach");
  const L = dict(profile.locale);
  const items = [
    { href: "/coach/checkin", label: L.coach_checkin },
    { href: "/coach/schedule", label: L.schedule },
    { href: "/coach/assess", label: L.coach_monthly },
    { href: "/coach/exams", label: L.coach_assess },
    { href: "/coach/payroll", label: L.coach_payroll },
  ];
  return (
    <AppShell
      groups={[{ group: "Coach", items }]}
      role={profile.role}
      name={profile.full_name ?? profile.email ?? "Coach"}
      accountHref="/coach/account"
      bell={<NotificationBellServer />}
      langToggle={<LangToggle locale={profile.locale} action={toggleStaffLocale} />}
      labels={{ dashboard: L.dashboard, account: L.account, home: L.home }}
    >
      {children}
    </AppShell>
  );
}
