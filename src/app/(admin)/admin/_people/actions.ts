"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { profileSchema } from "@/lib/validation";
import type { Role } from "@/lib/types";
import { createLoginToken } from "@/lib/parent-auth";
import { getBaseUrl } from "@/lib/url";
import { waLink } from "@/lib/wa";

function basePath(role: Role): string {
  return role === "coach" ? "/admin/coaches" : "/admin/parents";
}
function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// Detach a student from a parent (Directory → edit parent). Leaves the student
// in place, just clears their parent_id. Service-role (admin-gated route).
export async function unlinkChild(formData: FormData) {
  const studentId = String(formData.get("student_id"));
  const parentId = String(formData.get("parent_id"));
  const db = createAdminClient();
  await db.from("students").update({ parent_id: null }).eq("id", studentId);
  revalidatePath(`/admin/parents/${parentId}`);
  revalidatePath("/admin/people");
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

export async function deletePeople(role: Role, formData: FormData) {
  const ids = formData.getAll("ids").map(String);
  if (!ids.length) return;
  const db = createAdminClient();
  // No bulk auth-delete API — remove each user; the profile row cascades.
  await Promise.all(ids.map((id) => db.auth.admin.deleteUser(id)));
  revalidatePath(basePath(role));
}

// Generate a one-time parent login link (proposal v7 §7.2). Token is valid for
// 7 days and can be used once. Admin pastes the URL into their WhatsApp DM with
// the parent. Returns the URL (and a wa.me prefill if the parent has a phone)
// to the page via search-params so the admin can copy without re-running the
// action.
export async function generateParentLoginLink(formData: FormData) {
  const parentId = String(formData.get("parent_id"));
  if (!parentId) redirect("/admin/parents");

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const db = createAdminClient();
  const { data: parent } = await db
    .from("profiles")
    .select("id, role, full_name, phone")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent || parent.role !== "parent") {
    redirect(`/admin/parents/${parentId}?error=${encodeURIComponent("Not a parent profile")}`);
  }

  const token = await createLoginToken(parentId, user?.id ?? null);
  const baseUrl = await getBaseUrl();
  const url = `${baseUrl}/parent-login/t/${token}`;

  const params = new URLSearchParams({ link: url });
  if (parent.phone) {
    const wa = waLink(
      parent.phone,
      `Hi ${parent.full_name ?? ""}, here is your Hong Badminton Academy login link — tap to sign in: ${url}`,
    );
    if (wa) params.set("wa", wa);
  }
  revalidatePath(`/admin/parents/${parentId}`);
  redirect(`/admin/parents/${parentId}?${params.toString()}`);
}

// Admin "Send password reset email" — Supabase emails the parent a reset link
// that lands on /parent-login/reset. Needs the parent to have an email on file
// and Supabase SMTP configured to actually deliver.
export async function sendParentPasswordReset(formData: FormData) {
  const parentId = String(formData.get("parent_id"));
  if (!parentId) redirect("/admin/parents");

  const db = createAdminClient();
  const { data: parent } = await db
    .from("profiles")
    .select("id, role, email")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent || parent.role !== "parent") {
    redirect(`/admin/parents/${parentId}?error=${encodeURIComponent("Not a parent profile")}`);
  }
  if (!parent.email) {
    redirect(`/admin/parents/${parentId}?error=${encodeURIComponent("This parent has no email on file — add one first.")}`);
  }

  const supabase = await createClient();
  const baseUrl = await getBaseUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(parent.email, {
    redirectTo: `${baseUrl}/parent-login/reset`,
  });
  if (error) {
    redirect(`/admin/parents/${parentId}?error=${encodeURIComponent(error.message)}`);
  }
  revalidatePath(`/admin/parents/${parentId}`);
  redirect(`/admin/parents/${parentId}?saved=${encodeURIComponent("Password reset email sent.")}`);
}

// Set a coach's per-lesson pay rate (drives the auto-calculated payroll). Stored
// in the admin-only coach_pay table, not on profiles, so coaches can't read it.
// Service-role client bypasses RLS.
export async function setCoachRate(formData: FormData) {
  const id = String(formData.get("id"));
  const rate = Number(formData.get("rate"));
  if (!id || !Number.isFinite(rate) || rate < 0) return;
  const db = createAdminClient();
  await db
    .from("coach_pay")
    .upsert({ coach_id: id, pay_per_lesson: rate, updated_at: new Date().toISOString() });
  revalidatePath("/admin/coaches/summary");
}
