import { redirect } from "next/navigation";
import { getProfile, homeForRole } from "@/lib/auth";
import { getParentIdFromCookie } from "@/lib/parent-auth";

// Role router: sends each signed-in user to their area.
export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  // Supabase password-reset emails land on the Site URL root with a ?code= when
  // the redirect URL isn't allow-listed. Forward it to the reset page so the
  // flow still completes. (The email's DOMAIN is the Supabase Site URL — set
  // that to production to stop the localhost link.)
  const { code } = await searchParams;
  if (code) redirect(`/parent-login/reset?code=${encodeURIComponent(code)}`);

  // Staff (admin/coach) have a Supabase profile — prefer it so a lingering
  // parent cookie on the same browser doesn't trap them in the parent area.
  const profile = await getProfile();
  if (profile) redirect(homeForRole(profile.role));

  // Parents use the custom cookie session (no Supabase auth row).
  const parentId = await getParentIdFromCookie();
  if (parentId) redirect("/parent");

  redirect("/login");
}
