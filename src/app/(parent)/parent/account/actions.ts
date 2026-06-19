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
