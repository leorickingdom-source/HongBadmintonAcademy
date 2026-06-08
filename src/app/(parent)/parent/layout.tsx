import { requireRole } from "@/lib/auth";
import { AppShell } from "@/components/app-shell";
import { PARENT_NAV } from "@/lib/constants";

export default async function ParentLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const profile = await requireRole("parent");
  return (
    <AppShell
      groups={[{ group: "Parent", items: PARENT_NAV }]}
      role={profile.role}
      name={profile.full_name ?? profile.email ?? "Parent"}
    >
      {children}
    </AppShell>
  );
}
