import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { ADMIN_NAV } from "@/lib/constants";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("admin");
  return (
    <AppShell
      groups={ADMIN_NAV}
      role={profile.role}
      name={profile.full_name ?? profile.email ?? "Admin"}
    >
      {children}
    </AppShell>
  );
}
