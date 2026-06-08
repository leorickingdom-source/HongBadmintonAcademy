import { redirect } from "next/navigation";
import { getProfile, homeForRole } from "@/lib/auth";

// Role router: sends each signed-in user to their area.
export default async function Home() {
  const profile = await getProfile();
  if (!profile) redirect("/login");
  redirect(homeForRole(profile.role));
}
