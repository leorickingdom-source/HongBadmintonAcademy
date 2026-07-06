"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { notifyAdmins } from "@/lib/notifications";
import { formatDate, formatTime } from "@/lib/format";

// Coach requests leave for one of their own sessions. RLS enforces that the
// session belongs to a class they coach.
export async function requestCoachLeave(formData: FormData) {
  const me = await requireRole("coach");
  const session_id = String(formData.get("session_id"));
  const reason = String(formData.get("reason") ?? "").trim().slice(0, 300) || null;
  if (!session_id) return;

  const supabase = await createClient();
  const { error } = await supabase.from("coach_leave_requests").upsert(
    { session_id, coach_id: me.id, reason, status: "pending", decided_by: null, decided_at: null },
    { onConflict: "session_id,coach_id" },
  );
  if (error) {
    redirect(`/coach/sessions/${session_id}?error=${encodeURIComponent(error.message)}`);
  }

  // RLS-read the session for the notification copy (their own class → visible).
  const { data: s } = await supabase
    .from("sessions")
    .select("session_date, start_time, classes(name)")
    .eq("id", session_id)
    .maybeSingle();
  await notifyAdmins({
    type: "coach_leave",
    title: "Coach leave request",
    body: `${me.full_name ?? "A coach"} — ${(s as any)?.classes?.name ?? "class"} on ${formatDate((s as any)?.session_date)} ${formatTime((s as any)?.start_time)}${reason ? ` · ${reason}` : ""}`,
    url: "/admin/leave",
  });

  revalidatePath(`/coach/sessions/${session_id}`);
  redirect(`/coach/sessions/${session_id}?leave=sent`);
}

// Withdraw a still-pending request (RLS: own + pending only).
export async function withdrawCoachLeave(formData: FormData) {
  const me = await requireRole("coach");
  const session_id = String(formData.get("session_id"));
  if (!session_id) return;
  const supabase = await createClient();
  await supabase
    .from("coach_leave_requests")
    .delete()
    .eq("session_id", session_id)
    .eq("coach_id", me.id)
    .eq("status", "pending");
  revalidatePath(`/coach/sessions/${session_id}`);
  redirect(`/coach/sessions/${session_id}`);
}
