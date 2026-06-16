"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { parseHolidayFile } from "@/lib/holiday-import";
import { loadHolidayMap } from "@/lib/holidays-server";

function err(message: string): never {
  redirect(`/admin/holidays?error=${encodeURIComponent(message)}`);
}

// Retroactive cleanup: delete future *scheduled* sessions that now fall on a
// holiday (public/imported/school). Generation only skips going forward; this
// clears ones already created. Deletes (no WhatsApp spam); past/completed/
// canceled sessions are left untouched.
export async function removeHolidaySessions() {
  const supabase = await createClient();
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: future } = await supabase
    .from("sessions")
    .select("id, session_date")
    .gte("session_date", today)
    .eq("status", "scheduled");
  if (!future || future.length === 0) redirect("/admin/holidays?removed=0");

  const maxDate = future.reduce((m, s) => (s.session_date > m ? s.session_date : m), today);
  const map = await loadHolidayMap(supabase, today, maxDate);
  const ids = future.filter((s) => map[s.session_date]).map((s) => s.id);
  if (ids.length) await supabase.from("sessions").delete().in("id", ids);

  revalidatePath("/admin/sessions");
  revalidatePath("/admin");
  revalidatePath("/parent/schedule");
  revalidatePath("/coach/schedule");
  redirect(`/admin/holidays?removed=${ids.length}`);
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
