"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

// Record a tap without hardware (demo / manual). Mirrors the NFC endpoint logic.
export async function simulateTap(formData: FormData) {
  const session_id = String(formData.get("session_id"));
  const student_id = String(formData.get("student_id"));
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("session_date, start_time, grace_minutes")
    .eq("id", session_id)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("attendance")
    .select("id, tap_out_at")
    .eq("session_id", session_id)
    .eq("student_id", student_id)
    .maybeSingle();

  const now = new Date();

  if (!existing) {
    let isLate = false;
    if (session) {
      const start = new Date(`${session.session_date}T${session.start_time}`);
      isLate = now > new Date(start.getTime() + session.grace_minutes * 60_000);
    }
    await supabase.from("attendance").insert({
      session_id,
      student_id,
      status: isLate ? "late" : "present",
      tap_in_at: now.toISOString(),
      flagged: isLate,
      flag_reason: isLate ? "Late tap-in" : null,
    });
  } else if (!existing.tap_out_at) {
    await supabase.from("attendance").update({ tap_out_at: now.toISOString() }).eq("id", existing.id);
  } else {
    await supabase.from("attendance").update({ tap_out_at: now.toISOString() }).eq("id", existing.id);
  }

  revalidatePath(`/admin/attendance/${session_id}`);
}

export async function setAttendanceStatus(formData: FormData) {
  const session_id = String(formData.get("session_id"));
  const student_id = String(formData.get("student_id"));
  const status = String(formData.get("status"));
  const supabase = await createClient();

  await supabase
    .from("attendance")
    .upsert(
      { session_id, student_id, status, flagged: status === "absent" || status === "late" },
      { onConflict: "session_id,student_id" },
    );

  revalidatePath(`/admin/attendance/${session_id}`);
}

export async function processFlags(formData: FormData) {
  const session_id = String(formData.get("session_id"));
  const supabase = await createClient();
  await supabase.rpc("process_session_attendance", { p_session_id: session_id });
  revalidatePath(`/admin/attendance/${session_id}`);
}
