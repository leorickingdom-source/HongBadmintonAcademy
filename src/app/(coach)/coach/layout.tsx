import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { COACH_NAV } from "@/lib/constants";

export default async function CoachLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("coach");
  return (
    <AppShell
      groups={[{ group: "Coach", items: COACH_NAV }]}
      role={profile.role}
      name={profile.full_name ?? profile.email ?? "Coach"}
    >
      {children}
    </AppShell>
  );
}
