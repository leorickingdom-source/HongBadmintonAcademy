"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { feePlanSchema } from "@/lib/validation";

function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createFeePlan(formData: FormData) {
  const parsed = feePlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err("/admin/fee-plans/new", parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("fee_plans").insert(parsed.data);
  if (error) err("/admin/fee-plans/new", error.message);
  revalidatePath("/admin/fee-plans");
  redirect("/admin/fee-plans");
}

export async function updateFeePlan(formData: FormData) {
  const id = String(formData.get("id"));
  const parsed = feePlanSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`/admin/fee-plans/${id}`, parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("fee_plans").update(parsed.data).eq("id", id);
  if (error) err(`/admin/fee-plans/${id}`, error.message);
  revalidatePath("/admin/fee-plans");
  redirect("/admin/fee-plans");
}

export async function deleteFeePlan(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("fee_plans").delete().eq("id", id);
  revalidatePath("/admin/fee-plans");
}
