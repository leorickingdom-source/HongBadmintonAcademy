"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { classSchema, scheduleSchema } from "@/lib/validation";
import { publicHolidayName, schoolHolidayMap } from "@/lib/holidays";

function err(path: string, message: string): never {
  redirect(`${path}?error=${encodeURIComponent(message)}`);
}

// Sessions surface on the class page, the admin dashboard, and both parent
// schedule views. Mutating a session must refresh all of them or those lists
// serve stale rows from the router cache.
function revalidateSchedule(class_id: string) {
  revalidatePath(`/admin/classes/${class_id}`);
  revalidatePath("/admin");
  revalidatePath("/parent");
  revalidatePath("/parent/schedule");
}

export async function createClass(formData: FormData) {
  const parsed = classSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err("/admin/classes/new", parsed.error.issues[0].message);
  const supabase = await createClient();
  const { data, error } = await supabase.from("classes").insert(parsed.data).select("id").single();
  if (error) err("/admin/classes/new", error.message);
  revalidatePath("/admin/classes");
  redirect(`/admin/classes/${data!.id}`);
}

export async function updateClass(formData: FormData) {
  const id = String(formData.get("id"));
  const parsed = classSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`/admin/classes/${id}`, parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("classes").update(parsed.data).eq("id", id);
  if (error) err(`/admin/classes/${id}`, error.message);
  revalidatePath(`/admin/classes/${id}`);
  redirect("/admin/classes");
}

export async function deleteClass(formData: FormData) {
  const id = String(formData.get("id"));
  const supabase = await createClient();
  await supabase.from("classes").delete().eq("id", id);
  revalidatePath("/admin/classes");
}

export async function deleteClasses(formData: FormData) {
  const ids = formData.getAll("ids").map(String);
  if (!ids.length) return;
  const supabase = await createClient();
  await supabase.from("classes").delete().in("id", ids);
  revalidatePath("/admin/classes");
}

// ─── Schedules ──────────────────────────────────────────────────────────────
export async function addSchedule(formData: FormData) {
  const class_id = String(formData.get("class_id"));
  const parsed = scheduleSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(`/admin/classes/${class_id}`, parsed.error.issues[0].message);
  const supabase = await createClient();
  const { error } = await supabase.from("class_schedules").insert(parsed.data);
  if (error) err(`/admin/classes/${class_id}`, error.message);
  revalidatePath(`/admin/classes/${class_id}`);
}

export async function deleteSchedule(formData: FormData) {
  const id = String(formData.get("id"));
  const class_id = String(formData.get("class_id"));
  const supabase = await createClient();
  await supabase.from("class_schedules").delete().eq("id", id);
  revalidatePath(`/admin/classes/${class_id}`);
}

// ─── Coaches ────────────────────────────────────────────────────────────────
export async function addCoach(formData: FormData) {
  const class_id = String(formData.get("class_id"));
  const coach_id = String(formData.get("coach_id"));
  if (!coach_id) err(`/admin/classes/${class_id}`, "Pick a coach");
  const supabase = await createClient();
  const { error } = await supabase
    .from("class_coaches")
    .insert({ class_id, coach_id });
  if (error) err(`/admin/classes/${class_id}`, error.message);
  revalidatePath(`/admin/classes/${class_id}`);
}

// Assign several coaches at once (the form only offers unassigned ones).
export async function addCoaches(formData: FormData) {
  const class_id = String(formData.get("class_id"));
  const ids = formData.getAll("coach_ids").map(String).filter(Boolean);
  if (!ids.length) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("class_coaches")
    .insert(ids.map((coach_id) => ({ class_id, coach_id })));
  if (error) err(`/admin/classes/${class_id}`, error.message);
  revalidatePath(`/admin/classes/${class_id}`);
}

export async function removeCoach(formData: FormData) {
  const class_id = String(formData.get("class_id"));
  const coach_id = String(formData.get("coach_id"));
  const supabase = await createClient();
  await supabase.from("class_coaches").delete().eq("class_id", class_id).eq("coach_id", coach_id);
  revalidatePath(`/admin/classes/${class_id}`);
}

// ─── Enrollments ────────────────────────────────────────────────────────────
export async function enrollStudent(formData: FormData) {
  const class_id = String(formData.get("class_id"));
  const student_id = String(formData.get("student_id"));
  if (!student_id) err(`/admin/classes/${class_id}`, "Pick a student");
  const supabase = await createClient();
  const { error } = await supabase
    .from("enrollments")
    .insert({ class_id, student_id });
  if (error) err(`/admin/classes/${class_id}`, error.message);
  revalidatePath(`/admin/classes/${class_id}`);
}

// Enroll several students at once (the form only offers not-yet-enrolled ones).
export async function enrollStudents(formData: FormData) {
  const class_id = String(formData.get("class_id"));
  const ids = formData.getAll("student_ids").map(String).filter(Boolean);
  if (!ids.length) return;
  const supabase = await createClient();
  const { error } = await supabase
    .from("enrollments")
    .insert(ids.map((student_id) => ({ class_id, student_id })));
  if (error) err(`/admin/classes/${class_id}`, error.message);
  revalidatePath(`/admin/classes/${class_id}`);
}

export async function unenrollStudent(formData: FormData) {
  const id = String(formData.get("id"));
  const class_id = String(formData.get("class_id"));
  const supabase = await createClient();
  await supabase.from("enrollments").delete().eq("id", id);
  revalidatePath(`/admin/classes/${class_id}`);
}

// ─── Generate sessions from the weekly schedule (next 4 weeks) ───────────────
export async function generateSessions(formData: FormData) {
  const class_id = String(formData.get("class_id"));
  const supabase = await createClient();

  const { data: schedules } = await supabase
    .from("class_schedules")
    .select("*")
    .eq("class_id", class_id)
    .eq("is_active", true);

  if (!schedules || schedules.length === 0) {
    err(`/admin/classes/${class_id}`, "Add a schedule first");
  }

  // Holidays to skip: Malaysian public holidays + the academy's school holidays.
  const { data: schoolRows } = await supabase.from("school_holidays").select("name, start_date, end_date");
  const schoolMap = schoolHolidayMap(schoolRows ?? []);
  const isHoliday = (ymd: string) => Boolean(publicHolidayName(ymd) || schoolMap.has(ymd));

  const rows: Record<string, unknown>[] = [];
  const start = new Date();
  for (let i = 0; i < 28; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dow = d.getDay();
    const dateStr = d.toLocaleDateString("en-CA");
    if (isHoliday(dateStr)) continue; // no classes on holidays
    for (const s of schedules!) {
      if (s.day_of_week === dow) {
        rows.push({
          class_id,
          schedule_id: s.id,
          session_date: dateStr,
          start_time: s.start_time,
          end_time: s.end_time,
          location: s.location,
          grace_minutes: s.grace_minutes,
          status: "scheduled",
        });
      }
    }
  }

  if (rows.length) {
    // Ignore duplicates (unique on class_id, session_date, start_time)
    await supabase.from("sessions").upsert(rows, {
      onConflict: "class_id,session_date,start_time",
      ignoreDuplicates: true,
    });
  }
  revalidateSchedule(class_id);
}

// ─── Single sessions (cancel / restore / delete) ─────────────────────────────
export async function cancelSession(formData: FormData) {
  const id = String(formData.get("id"));
  const class_id = String(formData.get("class_id"));
  const supabase = await createClient();
  await supabase.from("sessions").update({ status: "canceled" }).eq("id", id);
  revalidateSchedule(class_id);
}

export async function restoreSession(formData: FormData) {
  const id = String(formData.get("id"));
  const class_id = String(formData.get("class_id"));
  const supabase = await createClient();
  await supabase.from("sessions").update({ status: "scheduled" }).eq("id", id);
  revalidateSchedule(class_id);
}

export async function deleteSession(formData: FormData) {
  const id = String(formData.get("id"));
  const class_id = String(formData.get("class_id"));
  const supabase = await createClient();
  await supabase.from("sessions").delete().eq("id", id);
  revalidateSchedule(class_id);
}

export async function deleteSessions(formData: FormData) {
  const class_id = String(formData.get("class_id"));
  const ids = formData.getAll("ids").map(String);
  if (ids.length) {
    const supabase = await createClient();
    await supabase.from("sessions").delete().in("id", ids);
  }
  revalidateSchedule(class_id);
}
