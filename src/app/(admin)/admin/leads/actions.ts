"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveWriteBranch } from "@/lib/branch";

// All lead mutations go through the RLS client (createClient), so a branch-admin
// can only touch leads in their own branch — admin_branch_ok() enforces it in
// Postgres (migration 0049). requireRole is the app-layer gate on top.

const LEAD_STATUSES = ["new", "contacted", "trial_booked", "trialed", "enrolled", "lost"] as const;

export async function updateLeadStatus(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!id || !(LEAD_STATUSES as readonly string[]).includes(status)) return;

  const db = await createClient();
  await db.from("trial_leads").update({ status }).eq("id", id);
  revalidatePath("/admin/leads");
}

export async function assignLead(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) return;
  const assignee = String(formData.get("assigned_to") ?? "").trim() || null;

  const db = await createClient();
  await db.from("trial_leads").update({ assigned_to: assignee }).eq("id", id);
  revalidatePath("/admin/leads");
}

export async function addLeadNote(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  const text = String(formData.get("note") ?? "").trim();
  if (!id || !text) return;

  const db = await createClient();
  // Append as a timestamped line (MYT) so the notes field reads as a log.
  const { data: cur } = await db.from("trial_leads").select("notes").eq("id", id).maybeSingle();
  const stamp = new Date().toLocaleString("en-MY", {
    timeZone: "Asia/Kuala_Lumpur",
    dateStyle: "short",
    timeStyle: "short",
  });
  const line = `[${stamp}] ${text}`;
  const next = cur?.notes ? `${cur.notes}\n${line}` : line;
  await db.from("trial_leads").update({ notes: next }).eq("id", id);
  revalidatePath("/admin/leads");
}

function clampLevel(v: FormDataEntryValue | null): number {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(6, Math.max(1, n)) : 1;
}

// Convert a trialed lead into a real academy student (Phase 2). Mirrors the
// admin createStudent flow (RLS client, branch stamped by resolveWriteBranch,
// 1–6 level). Optionally spins up a parent login (auth user + profile via the
// on_auth_user_created trigger) when the lead left an email — the parent then
// signs in via a reset/magic link (see Directory → parent). The lead is stamped
// enrolled + converted_student_id so it can't be converted twice.
export async function convertLead(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!id) redirect("/admin/leads");
  const level = clampLevel(formData.get("level"));
  const wantParent = String(formData.get("create_parent") ?? "") === "on";

  const db = await createClient();
  const { data: lead } = await db
    .from("trial_leads")
    .select("id, child_name, child_dob, experience, parent_name, phone, email, branch_id, notes, converted_student_id")
    .eq("id", id)
    .maybeSingle();
  if (!lead) redirect("/admin/leads?error=" + encodeURIComponent("Lead not found."));
  if (lead.converted_student_id) {
    redirect(`/admin/students/${lead.converted_student_id}`);
  }

  // Optional parent login. Needs an email; if asked for without one, tell the
  // admin rather than silently dropping it.
  let parentId: string | null = null;
  if (wantParent) {
    if (!lead.email) {
      redirect("/admin/leads?error=" + encodeURIComponent("Add an email to the lead first, or convert without a parent login."));
    }
    const admin = createAdminClient();
    const { data: created, error: pErr } = await admin.auth.admin.createUser({
      email: lead.email,
      password: crypto.randomUUID(),
      email_confirm: true,
      user_metadata: { full_name: lead.parent_name, phone: lead.phone, role: "parent" },
    });
    if (pErr) redirect("/admin/leads?error=" + encodeURIComponent(`Couldn't create the parent login: ${pErr.message}`));
    parentId = created?.user?.id ?? null;
  }

  // Intake context carried onto the student's notes.
  const stamp = new Date().toLocaleDateString("en-MY", { timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium" });
  const bits = [`Converted from a trial lead (${stamp}).`];
  if (lead.experience) bits.push(`Experience at intake: ${lead.experience}.`);
  if (lead.notes) bits.push(lead.notes);

  const branch_id = resolveWriteBranch(me, lead.branch_id);
  const { data: student, error: sErr } = await db
    .from("students")
    .insert({
      full_name: lead.child_name,
      dob: lead.child_dob,
      parent_id: parentId,
      branch_id,
      level,
      status: "active",
      notes: bits.join("\n\n"),
    })
    .select("id")
    .single();
  if (sErr || !student) {
    redirect("/admin/leads?error=" + encodeURIComponent(`Couldn't create the student: ${sErr?.message ?? "unknown error"}`));
  }

  await db.from("trial_leads").update({ status: "enrolled", converted_student_id: student.id }).eq("id", id);

  revalidatePath("/admin/leads");
  revalidatePath("/admin/students");
  redirect(`/admin/students/${student.id}`);
}
