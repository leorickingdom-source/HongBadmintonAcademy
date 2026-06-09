"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { profileSchema } from "@/lib/validation";
import type { Role } from "@/lib/types";

function basePath(role: Role): string {
  return role === "coach" ? "/admin/coaches" : "/admin/parents";
}
function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// Create a coach/parent = create the auth user (service role). The
// on_auth_user_created trigger then inserts the matching profile row.
export async function createPerson(role: Role, formData: FormData) {
  const base = basePath(role);
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`${base}/new`, parsed.error.issues[0].message);
  const { full_name, email, phone, password } = parsed.data;
  if (!password) err(`${base}/new`, "Password is required for a new account");

  const db = createAdminClient();
  const { error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, phone, role },
  });
  if (error) err(`${base}/new`, error.message);

  revalidatePath(base);
  redirect(base);
}

export async function updatePerson(role: Role, formData: FormData) {
  const base = basePath(role);
  const id = String(formData.get("id"));
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`${base}/${id}`, parsed.error.issues[0].message);
  const { full_name, phone, password } = parsed.data;

  const db = createAdminClient();
  const { error } = await db
    .from("profiles")
    .update({ full_name, phone })
    .eq("id", id);
  if (error) err(`${base}/${id}`, error.message);

  // Optional password reset
  if (password) {
    const { error: pwErr } = await db.auth.admin.updateUserById(id, { password });
    if (pwErr) err(`${base}/${id}`, pwErr.message);
  }

  revalidatePath(base);
  redirect(base);
}

export async function deletePerson(role: Role, formData: FormData) {
  const id = String(formData.get("id"));
  const db = createAdminClient();
  await db.auth.admin.deleteUser(id); // cascades to profile
  revalidatePath(basePath(role));
}

// Set a coach's per-lesson pay rate (drives the auto-calculated payroll).
export async function setCoachRate(formData: FormData) {
  const id = String(formData.get("id"));
  const rate = Number(formData.get("rate"));
  if (!id || !Number.isFinite(rate) || rate < 0) return;
  const db = createAdminClient();
  await db.from("profiles").update({ pay_per_lesson: rate }).eq("id", id);
  revalidatePath("/admin/coaches/summary");
}
