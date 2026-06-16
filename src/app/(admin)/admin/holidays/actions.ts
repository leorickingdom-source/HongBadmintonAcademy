"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function err(message: string): never {
  redirect(`/admin/holidays?error=${encodeURIComponent(message)}`);
}

export async function addSchoolHoliday(formData: FormData) {
  const name = String(formData.get("name") ?? "").trim();
  const start_date = String(formData.get("start_date") ?? "").trim();
  let end_date = String(formData.get("end_date") ?? "").trim();
  if (!name) err("Give the holiday a name.");
  if (!start_date) err("Pick a start date.");
  if (!end_date) end_date = start_date; // single-day holiday
  if (end_date < start_date) err("End date can't be before the start date.");

  const supabase = await createClient();
  const { error } = await supabase.from("school_holidays").insert({ name, start_date, end_date });
  if (error) err(error.message);
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/sessions");
}

export async function deleteSchoolHoliday(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("school_holidays").delete().eq("id", id);
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/sessions");
}
