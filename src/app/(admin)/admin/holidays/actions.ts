"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseHolidayFile } from "@/lib/holiday-import";

function err(message: string): never {
  redirect(`/admin/holidays?error=${encodeURIComponent(message)}`);
}

// Import public holidays from an uploaded CSV or XLSX (columns: date, name).
export async function importPublicHolidays(formData: FormData) {
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) err("Choose a CSV or Excel (.xlsx) file.");

  let parsed;
  try {
    parsed = parseHolidayFile(file.name, Buffer.from(await file.arrayBuffer()));
  } catch {
    err("Couldn't read that file — use a CSV or .xlsx with two columns: date, name.");
  }
  if (!parsed.length) err("No date,name rows found. Use two columns: date (YYYY-MM-DD), name.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("public_holidays")
    .upsert(parsed.map((p) => ({ holiday_date: p.date, name: p.name })), { onConflict: "holiday_date" });
  if (error) err(error.message);

  revalidatePath("/admin/holidays");
  revalidatePath("/admin/sessions");
  redirect(`/admin/holidays?imported=${parsed.length}`);
}

export async function clearImportedHolidays() {
  const supabase = await createClient();
  await supabase.from("public_holidays").delete().neq("holiday_date", "1900-01-01");
  revalidatePath("/admin/holidays");
  revalidatePath("/admin/sessions");
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
