"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

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
