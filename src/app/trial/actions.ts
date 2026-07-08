"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { trialLeadSchema } from "@/lib/validation";
import { notifyAdmins } from "@/lib/notifications";

function err(message: string): never {
  redirect(`/trial?error=${encodeURIComponent(message)}`);
}

// Public "book a free trial" → drop a lead in status 'new' and ping the admins.
// No login, no payment, no student/parent row — a lead is created here and an
// admin converts it later (see /admin/leads). Writes use the service-role
// client because there is no anon RLS policy on trial_leads.
export async function requestTrial(formData: FormData) {
  // Honeypot: real users never fill the hidden "company" field; bots do. Drop
  // silently (pretend success) so scripted spam never creates a lead.
  if (String(formData.get("company") ?? "").trim()) redirect("/trial/thanks");

  const parsed = trialLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(parsed.error.issues[0].message);
  const { child_name, child_dob, experience, parent_name, phone, email, branch_id, preferred_slot } = parsed.data;

  const db = createAdminClient();

  // Re-validate any posted branch server-side — it must be an active branch.
  // Never trust the raw posted id (a bad/inactive one just falls back to null).
  let branch: string | null = null;
  if (branch_id) {
    const { data: b } = await db
      .from("branches")
      .select("id")
      .eq("id", branch_id)
      .eq("is_active", true)
      .maybeSingle();
    branch = b?.id ?? null;
  }

  const { error } = await db.from("trial_leads").insert({
    child_name,
    child_dob,
    experience,
    parent_name,
    phone,
    email,
    branch_id: branch,
    preferred_slot,
    status: "new",
    source: "web",
    consent: true,
    consent_at: new Date().toISOString(),
  });
  if (error) err("Sorry — we couldn't submit your request. Please try again.");

  // Ping the admins' notification bell. Best-effort: never block the parent's
  // submit on it (notifyAdmins itself swallows insert failures).
  try {
    await notifyAdmins({
      type: "trial_lead",
      title: "New trial request",
      body: `${child_name} — ${parent_name} (${phone})`,
      url: "/admin/leads",
    });
  } catch {
    // ignore
  }

  redirect("/trial/thanks");
}
