"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { setParentSessionCookie } from "@/lib/parent-auth";
import { getBaseUrl } from "@/lib/url";

function loginError(next: string | null, message: string): never {
  const params = new URLSearchParams({ error: message });
  if (next) params.set("next", next);
  redirect(`/parent-login?${params.toString()}`);
}

// Email + password sign-in. Parents authenticate against Supabase Auth (where
// admin created them with an email + password), but the parent app itself runs
// on our own 1-year signed cookie — so once the password checks out we drop the
// Supabase session and issue the hba_parent cookie. (Admin & coach keep the
// Supabase session; parents never use it.)
export async function signInWithEmail(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  const password = String(formData.get("password") ?? "");
  const next = (formData.get("next") as string) || null;
  if (!email || !password) loginError(next, "Enter your email and password.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  const user = data?.user;
  if (error || !user) loginError(next, "Wrong email or password.");

  const db = createAdminClient();
  const { data: prof } = await db
    .from("profiles")
    .select("id, role")
    .eq("id", user.id)
    .maybeSingle();

  // We don't keep the Supabase session for parents.
  await supabase.auth.signOut({ scope: "local" });

  if (!prof || prof.role !== "parent") {
    loginError(next, "This login is for parents. Staff should use the staff login.");
  }

  await setParentSessionCookie(prof.id);
  redirect(next || "/parent");
}

// Forgot password → Supabase sends a reset email. We always report success so
// the form never reveals whether an email is registered.
export async function requestPasswordReset(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim().toLowerCase();
  if (!email) redirect(`/parent-login/forgot?error=${encodeURIComponent("Enter your email.")}`);

  const supabase = await createClient();
  const baseUrl = await getBaseUrl();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${baseUrl}/parent-login/reset` });
  redirect("/parent-login/forgot?sent=1");
}

// Set a new password from the reset link. Supabase appends ?code=… to the
// redirect; we exchange it for a recovery session, set the password, then issue
// our own cookie and drop the Supabase session.
export async function setNewPassword(formData: FormData) {
  const code = String(formData.get("code") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const back = (msg: string): never =>
    redirect(`/parent-login/reset?code=${encodeURIComponent(code)}&error=${encodeURIComponent(msg)}`);
  if (password.length < 8) back("Password must be at least 8 characters.");
  if (password !== confirm) back("Passwords don't match — try again.");

  const supabase = await createClient();
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      redirect(`/parent-login/forgot?error=${encodeURIComponent("This reset link has expired. Please request a new one.")}`);
    }
  }

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    redirect(`/parent-login/forgot?error=${encodeURIComponent("This reset link is invalid. Please request a new one.")}`);
  }

  const { error: upErr } = await supabase.auth.updateUser({ password });
  if (upErr) back(upErr.message);

  const db = createAdminClient();
  const { data: prof } = await db.from("profiles").select("id, role").eq("id", user.id).maybeSingle();

  await supabase.auth.signOut({ scope: "local" });

  if (!prof || prof.role !== "parent") {
    redirect(`/parent-login?error=${encodeURIComponent("This account is not a parent account.")}`);
  }
  await setParentSessionCookie(prof.id);
  redirect("/parent");
}
