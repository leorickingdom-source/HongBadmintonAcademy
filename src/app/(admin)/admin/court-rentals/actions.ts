"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";

const PATH = "/admin/court-rentals";

// Court rental cost is academy finance → super-admin only. RLS also enforces
// is_super_admin(), so these actions are defence-in-depth + the write path.
export async function createCourt(formData: FormData) {
  await requireSuperAdmin();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  const branch_id = String(formData.get("branch_id") ?? "").trim() || null;
  const hourly_rate = Math.max(0, Number(formData.get("hourly_rate") ?? 0) || 0);
  const supabase = await createClient();
  await supabase.from("courts").insert({ name, branch_id, hourly_rate });
  revalidatePath(PATH);
}

export async function deleteCourt(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("courts").delete().eq("id", id);
  revalidatePath(PATH);
}

export async function logRental(formData: FormData) {
  const me = await requireSuperAdmin();
  const court_id = String(formData.get("court_id") ?? "").trim();
  if (!court_id) return;
  const rental_date = String(formData.get("rental_date") ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(rental_date)) return;
  const hours = Math.max(0, Number(formData.get("hours") ?? 0) || 0);
  const amount = Math.max(0, Number(formData.get("amount") ?? 0) || 0);
  const note = String(formData.get("note") ?? "").trim().slice(0, 200) || null;

  const supabase = await createClient();
  // Inherit the court's branch so the report can be branch-scoped.
  const { data: court } = await supabase.from("courts").select("branch_id").eq("id", court_id).maybeSingle();
  await supabase.from("court_rentals").insert({
    court_id,
    branch_id: (court as any)?.branch_id ?? null,
    rental_date,
    hours,
    amount,
    note,
    created_by: me.id,
  });
  revalidatePath(PATH);
}

export async function deleteRental(formData: FormData) {
  await requireSuperAdmin();
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("court_rentals").delete().eq("id", id);
  revalidatePath(PATH);
}
