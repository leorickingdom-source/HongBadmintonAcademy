"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rewardRuleSchema } from "@/lib/validation";

function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

function parse(formData: FormData, path: string) {
  try {
    const parsed = rewardRuleSchema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) err(path, parsed.error.issues[0].message);
    return parsed.data;
  } catch (e) {
    err(path, (e as Error).message);
  }
}

export async function createRewardRule(formData: FormData) {
  const data = parse(formData, "/admin/rewards/new");
  const supabase = await createClient();
  const { error } = await supabase.from("reward_rules").insert(data);
  if (error) err("/admin/rewards/new", error.message);
  revalidatePath("/admin/rewards");
  redirect("/admin/rewards");
}

export async function updateRewardRule(formData: FormData) {
  const id = String(formData.get("id"));
  const data = parse(formData, `/admin/rewards/${id}`);
  const supabase = await createClient();
  const { error } = await supabase.from("reward_rules").update(data).eq("id", id);
  if (error) err(`/admin/rewards/${id}`, error.message);
  revalidatePath("/admin/rewards");
  redirect("/admin/rewards");
}

export async function deleteRewardRule(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("reward_rules").delete().eq("id", id);
  revalidatePath("/admin/rewards");
}
