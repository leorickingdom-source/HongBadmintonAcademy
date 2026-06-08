"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { schemeSchema, criterionSchema } from "@/lib/validation";

function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

export async function createScheme(formData: FormData) {
  const parsed = schemeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err("/admin/marking-schemes/new", parsed.error.issues[0].message);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("marking_schemes")
    .insert(parsed.data)
    .select("id")
    .single();
  if (error) err("/admin/marking-schemes/new", error.message);
  revalidatePath("/admin/marking-schemes");
  redirect(`/admin/marking-schemes/${data!.id}`);
}

export async function updateScheme(formData: FormData) {
  const id = String(formData.get("id"));
  const parsed = schemeSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`/admin/marking-schemes/${id}`, parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("marking_schemes").update(parsed.data).eq("id", id);
  if (error) err(`/admin/marking-schemes/${id}`, error.message);
  revalidatePath(`/admin/marking-schemes/${id}`);
  redirect("/admin/marking-schemes");
}

export async function deleteScheme(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("marking_schemes").delete().eq("id", id);
  revalidatePath("/admin/marking-schemes");
}

export async function addCriterion(formData: FormData) {
  const scheme_id = String(formData.get("scheme_id"));
  const parsed = criterionSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`/admin/marking-schemes/${scheme_id}`, parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("marking_criteria").insert(parsed.data);
  if (error) err(`/admin/marking-schemes/${scheme_id}`, error.message);
  revalidatePath(`/admin/marking-schemes/${scheme_id}`);
}

export async function deleteCriterion(formData: FormData) {
  const id = String(formData.get("id"));
  const scheme_id = String(formData.get("scheme_id"));
  const supabase = await createClient();
  await supabase.from("marking_criteria").delete().eq("id", id);
  revalidatePath(`/admin/marking-schemes/${scheme_id}`);
}
