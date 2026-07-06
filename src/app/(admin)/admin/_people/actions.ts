"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { requireRole, requireSuperAdmin } from "@/lib/auth";
import { profileSchema } from "@/lib/validation";
import type { Role } from "@/lib/types";

// Parents are day-to-day records (branch-admin may manage them); coaches/admins
// are staff lifecycle → super-admin only.
async function guardForRole(role: Role) {
  if (role === "parent") await requireRole("admin");
  else await requireSuperAdmin();
}
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
  await requireRole("admin");
  const studentId = String(formData.get("student_id"));
  const parentId = String(formData.get("parent_id"));
  const db = createAdminClient();
  await db.from("students").update({ parent_id: null }).eq("id", studentId);
  revalidatePath(`/admin/parents/${parentId}`);
  revalidatePath("/admin/people");
}

// Assign a student to this parent (reverse of picking a parent on the student
// form). RLS client → a branch-admin can only link students in their own branch.
export async function linkChild(formData: FormData) {
  await requireRole("admin");
  const parentId = String(formData.get("parent_id"));
  const studentId = String(formData.get("student_id"));
  if (!parentId || !studentId) return;
  const supabase = await createClient();
  const { error } = await supabase.from("students").update({ parent_id: parentId }).eq("id", studentId);
  if (error) err(`/admin/parents/${parentId}`, error.message);
  revalidatePath(`/admin/parents/${parentId}`);
  revalidatePath("/admin/people");
}

// Create a coach/parent = create the auth user (service role). The
// on_auth_user_created trigger then inserts the matching profile row.
export async function createPerson(role: Role, formData: FormData) {
  await guardForRole(role);
  const base = basePath(role);
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`${base}/new`, parsed.error.issues[0].message);
  const { full_name, email, phone, password } = parsed.data;
  if (!password) err(`${base}/new`, "Password is required for a new account");

  const db = createAdminClient();
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, phone, role },
  });
  if (error) err(`${base}/new`, error.message);

  // Coaches can be assigned a home branch from the form (parents have none).
  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  if (created?.user?.id && branchId && role !== "parent") {
    await db.from("profiles").update({ branch_id: branchId }).eq("id", created.user.id);
  }

  revalidatePath(base);
  redirect(base);
}

// Super-admin: create an admin / branch-admin / coach with a role + branch
// chosen on the Staff page. A super-admin row is cross-branch (branch null).
export async function createStaff(formData: FormData) {
  await requireSuperAdmin();
  const roleRaw = String(formData.get("role") ?? "admin");
  const role: Role = roleRaw === "super_admin" ? "super_admin" : roleRaw === "coach" ? "coach" : "admin";
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err("/admin/staff/new", parsed.error.issues[0].message);
  const { full_name, email, phone, password } = parsed.data;
  if (!password) err("/admin/staff/new", "Password is required for a new account");

  const db = createAdminClient();
  const { data: created, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name, phone, role },
  });
  if (error) err("/admin/staff/new", error.message);

  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  if (created?.user?.id) {
    await db.from("profiles").update({ branch_id: role === "super_admin" ? null : branchId }).eq("id", created.user.id);
  }

  revalidatePath("/admin/staff");
  redirect("/admin/staff");
}

export async function updatePerson(role: Role, formData: FormData) {
  await guardForRole(role);
  const base = basePath(role);
  const id = String(formData.get("id"));
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`${base}/${id}`, parsed.error.issues[0].message);
  const { full_name, phone, password } = parsed.data;

  const db = createAdminClient();
  const update: Record<string, unknown> = { full_name, phone };
  // Coaches/staff can be reassigned a branch from the edit form.
  const branchRaw = formData.get("branch_id");
  if (branchRaw !== null && role !== "parent") update.branch_id = String(branchRaw).trim() || null;

  // Staff (coach/admin) may also change their sign-in email from the edit form.
  const { email } = parsed.data;
  if (role !== "parent" && email) {
    const { data: cur } = await db.from("profiles").select("email").eq("id", id).maybeSingle();
    if (email !== cur?.email) {
      const { error: emErr } = await db.auth.admin.updateUserById(id, { email, email_confirm: true });
      if (emErr) err(`${base}/${id}`, emErr.message);
      update.email = email;
    }
  }

  const { error } = await db.from("profiles").update(update).eq("id", id);
  if (error) err(`${base}/${id}`, error.message);

  // Optional password reset
  if (password) {
    const { error: pwErr } = await db.auth.admin.updateUserById(id, { password });
    if (pwErr) err(`${base}/${id}`, pwErr.message);
  }

  revalidatePath(base);
  redirect(base);
}

// Super-admin: edit an existing admin / branch-admin / coach — including their
// role, branch, sign-in email and (optionally) a new password.
export async function updateStaff(formData: FormData) {
  const me = await requireSuperAdmin();
  const id = String(formData.get("id"));
  const roleRaw = String(formData.get("role") ?? "admin");
  const role: Role = roleRaw === "super_admin" ? "super_admin" : roleRaw === "coach" ? "coach" : "admin";
  if (id === me.id && role !== "super_admin") {
    err(`/admin/staff/${id}/edit`, "You can't remove your own super-admin role.");
  }
  const parsed = profileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`/admin/staff/${id}/edit`, parsed.error.issues[0].message);
  const { full_name, email, phone, password } = parsed.data;

  const db = createAdminClient();
  const { data: cur } = await db.from("profiles").select("email").eq("id", id).maybeSingle();

  if (email && email !== cur?.email) {
    const { error } = await db.auth.admin.updateUserById(id, { email, email_confirm: true });
    if (error) err(`/admin/staff/${id}/edit`, error.message);
  }
  if (password) {
    const { error } = await db.auth.admin.updateUserById(id, { password });
    if (error) err(`/admin/staff/${id}/edit`, error.message);
  }

  const branchId = String(formData.get("branch_id") ?? "").trim() || null;
  const { error } = await db
    .from("profiles")
    .update({ full_name, phone, email: email ?? cur?.email, role, branch_id: role === "super_admin" ? null : branchId })
    .eq("id", id);
  if (error) err(`/admin/staff/${id}/edit`, error.message);

  revalidatePath("/admin/staff");
  redirect("/admin/staff");
}

export async function deletePerson(role: Role, formData: FormData) {
  await guardForRole(role);
  const id = String(formData.get("id"));
  const db = createAdminClient();
  await db.auth.admin.deleteUser(id); // cascades to profile
  revalidatePath(basePath(role));
}

export async function deletePeople(role: Role, formData: FormData) {
  await guardForRole(role);
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
  const me = await requireRole("admin");
  const parentId = String(formData.get("parent_id"));
  if (!parentId) redirect("/admin/parents");

  const db = createAdminClient();
  const { data: parent } = await db
    .from("profiles")
    .select("id, role, full_name, phone")
    .eq("id", parentId)
    .maybeSingle();
  if (!parent || parent.role !== "parent") {
    redirect(`/admin/parents/${parentId}?error=${encodeURIComponent("Not a parent profile")}`);
  }

  const token = await createLoginToken(parentId, me.id);
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
  await requireRole("admin");
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
  await requireRole("admin");
  const id = String(formData.get("id"));
  const rate = Number(formData.get("rate"));
  if (!id || !Number.isFinite(rate) || rate < 0) return;
  const db = createAdminClient();
  await db
    .from("coach_pay")
    .upsert({ coach_id: id, pay_per_lesson: rate, updated_at: new Date().toISOString() });
  revalidatePath("/admin/coaches/summary");
}
