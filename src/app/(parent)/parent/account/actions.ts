"use server";

import { redirect } from "next/navigation";
import { requireParent } from "@/lib/parent-auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Parent self-service password change. Verifies the current password against
// Supabase Auth (a throwaway session we immediately drop — the parent stays
// signed in via their own hba_parent cookie), then sets the new one with the
// service-role admin API. No email round-trip, so it works without SMTP.
export async function changeParentPassword(formData: FormData) {
  const me = await requireParent();
  const current = String(formData.get("current") ?? "");
  const newPassword = String(formData.get("new_password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  function fail(msg: string): never {
    redirect(`/parent/account?error=${encodeURIComponent(msg)}`);
  }

  const email = me.email;
  if (!email) fail("No email on file — contact the academy.");
  if (newPassword.length < 8) fail("New password must be at least 8 characters.");
  if (newPassword !== confirm) fail("New passwords don't match.");
  if (newPassword === current) fail("New password must be different from the current one.");

  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({ email, password: current });
  await supabase.auth.signOut({ scope: "local" });
  if (signInErr) fail("Current password is incorrect.");

  const db = createAdminClient();
  const { error } = await db.auth.admin.updateUserById(me.id, { password: newPassword });
  if (error) fail(error.message);

  redirect("/parent/account?saved=1");
}

// Parent self-service contact update. Changes the login email in Supabase Auth
// (auto-confirmed, no email round-trip) and mirrors email + phone onto the
// profile — so the parent can fix their own details without bugging admin.
export async function updateParentContact(formData: FormData) {
  const me = await requireParent();
  const currentEmail = me.email;
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const phone = String(formData.get("phone") ?? "").trim();
  const current = String(formData.get("current") ?? "");

  function fail(msg: string): never {
    redirect(`/parent/account?error=${encodeURIComponent(msg)}`);
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) fail("Enter a valid email address.");

  const emailChanged = !currentEmail || email !== currentEmail.toLowerCase();

  // Changing the login email is identity-critical — confirm the current
  // password first (throwaway verify session, immediately dropped).
  if (emailChanged && currentEmail) {
    if (!current) fail("Enter your current password to change your email.");
    const supabase = await createClient();
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: currentEmail, password: current });
    await supabase.auth.signOut({ scope: "local" });
    if (signInErr) fail("Current password is incorrect.");
  }

  const db = createAdminClient();
  if (emailChanged) {
    const { error: authErr } = await db.auth.admin.updateUserById(me.id, { email, email_confirm: true });
    if (authErr) fail(authErr.message);
  }
  const { error } = await db.from("profiles").update({ email, phone: phone || null }).eq("id", me.id);
  if (error) fail(error.message);

  redirect("/parent/account?saved=contact");
}
