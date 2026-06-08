import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import type { Profile, Role } from "@/lib/types";

// Resolve the current user's profile (or null). Returns null when Supabase
// isn't configured yet so pages can render a setup notice instead of crashing.
export async function getProfile(): Promise<Profile | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

// Default landing path for a role.
export function homeForRole(role: Role): string {
  return role === "admin" ? "/admin" : role === "coach" ? "/coach" : "/parent";
}

// Guard a page to one or more roles. Redirects to /login when signed out, or to
// the user's own home when their role isn't allowed.
export async function requireRole(
  allowed: Role | Role[],
): Promise<Profile> {
  const profile = await getProfile();
  if (!profile) redirect("/login");

  const roles = Array.isArray(allowed) ? allowed : [allowed];
  if (!roles.includes(profile.role)) redirect(homeForRole(profile.role));

  return profile;
}
