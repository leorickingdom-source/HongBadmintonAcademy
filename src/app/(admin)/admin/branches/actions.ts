"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireSuperAdmin } from "@/lib/auth";
import { BRANCH_VIEW_COOKIE } from "@/lib/branch";

// Any admin's "viewing branch" switcher — narrows list/dashboard views to one
// branch (or "all"). Stored in a cookie; app-layer only (RLS is the boundary).
// (Branch CREATE/rename/delete below stays super-admin only.)
export async function setBranchView(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("branch_id") ?? "all");
  (await cookies()).set(BRANCH_VIEW_COOKIE, id, { sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 365 });
  revalidatePath("/admin", "layout");
}

function err(message: string): never {
  redirect(`/admin/branches?error=${encodeURIComponent(message)}`);
}

const clean = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return s ? s : null;
};

const COLOR_KEYS = new Set(["emerald", "blue", "amber", "rose", "violet", "cyan", "orange", "teal", "slate"]);
const cleanColor = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "").trim();
  return COLOR_KEYS.has(s) ? s : null;
};

export async function createBranch(formData: FormData) {
  await requireSuperAdmin();
  const name = clean(formData.get("name"));
  if (!name) err("Branch name is required.");
  const supabase = await createClient();
  const { error } = await supabase.from("branches").insert({
    name,
    code: clean(formData.get("code")),
    address: clean(formData.get("address")),
    phone: clean(formData.get("phone")),
    color: cleanColor(formData.get("color")),
  });
  if (error) err(error.message);
  revalidatePath("/admin/branches");
  redirect("/admin/branches?saved=1");
}

// Parse a finite lat/lng from the form, else null (blank = clear the coordinate).
const cleanCoord = (v: FormDataEntryValue | null, min: number, max: number): number | null => {
  const n = Number.parseFloat(String(v ?? "").trim());
  return Number.isFinite(n) && n >= min && n <= max ? n : null;
};

export async function updateBranch(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const name = clean(formData.get("name"));
  if (!name) err("Branch name is required.");

  // Geofence: coords are optional; radius clamped to a sane range. "enabled" only
  // bites once coordinates exist, but we store the flag as the admin set it.
  const radiusRaw = Number.parseInt(String(formData.get("geofence_radius_m") ?? ""), 10);
  const geofence_radius_m = Number.isFinite(radiusRaw) ? Math.min(5000, Math.max(20, radiusRaw)) : 300;

  const supabase = await createClient();
  const { error } = await supabase
    .from("branches")
    .update({
      name,
      code: clean(formData.get("code")),
      address: clean(formData.get("address")),
      phone: clean(formData.get("phone")),
      color: cleanColor(formData.get("color")),
      lat: cleanCoord(formData.get("lat"), -90, 90),
      lng: cleanCoord(formData.get("lng"), -180, 180),
      geofence_radius_m,
      geofence_enabled: formData.get("geofence_enabled") === "on",
      geofence_required: formData.get("geofence_required") === "on",
    })
    .eq("id", id);
  if (error) err(error.message);
  revalidatePath("/admin/branches");
  redirect("/admin/branches?saved=1");
}

// Seed a handful of sample students into a branch so a fresh/demo branch isn't a
// blank roster. Super-admin only, and idempotent — no-op if the branch already
// has students, so it can't pile up duplicates on repeat clicks.
export async function seedBranchStudents(formData: FormData) {
  await requireSuperAdmin();
  const branch_id = String(formData.get("id"));
  const supabase = await createClient();
  const { count } = await supabase
    .from("students")
    .select("*", { count: "exact", head: true })
    .eq("branch_id", branch_id);
  if ((count ?? 0) > 0) redirect("/admin/branches?saved=1");

  const names = ["Aiman Tan", "Mei Ling Wong", "Arjun Nair", "Siti Nur Adlina", "Daniel Lee", "Kavya Raman"];
  const rows = names.map((full_name, i) => ({
    full_name,
    branch_id,
    level: (i % 6) + 1,
    status: "active" as const,
  }));
  const { error } = await supabase.from("students").insert(rows);
  if (error) err(error.message);
  revalidatePath("/admin/branches");
  revalidatePath("/admin/people");
  redirect("/admin/branches?saved=1");
}

export async function toggleBranch(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const active = formData.get("active") === "true";
  const supabase = await createClient();
  await supabase.from("branches").update({ is_active: active }).eq("id", id);
  revalidatePath("/admin/branches");
}

// Hard-delete a branch. The branch_id FKs are ON DELETE SET NULL, so members
// aren't destroyed — they fall back to "no branch" (visible to all admins until
// reassigned). Blocked while the branch still has members so it isn't silently
// orphaning a live branch; deactivate instead.
export async function deleteBranch(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  const [{ count: students }, { count: classes }, { count: staff }] = await Promise.all([
    supabase.from("students").select("*", { count: "exact", head: true }).eq("branch_id", id),
    supabase.from("classes").select("*", { count: "exact", head: true }).eq("branch_id", id),
    supabase.from("profiles").select("*", { count: "exact", head: true }).eq("branch_id", id),
  ]);
  if ((students ?? 0) + (classes ?? 0) + (staff ?? 0) > 0) {
    err("That branch still has members — reassign or deactivate it first.");
  }
  await supabase.from("branches").delete().eq("id", id);
  revalidatePath("/admin/branches");
  redirect("/admin/branches?saved=1");
}
