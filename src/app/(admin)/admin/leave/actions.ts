"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
import { pushToUsers } from "@/lib/push";
import { formatDate, formatTime } from "@/lib/format";

function revalidate() {
  revalidatePath("/admin/leave");
  revalidatePath("/parent/schedule");
  revalidatePath("/coach/checkin");
}

// Load a leave row + its session/student labels for notification copy.
async function loadLeave(id: string) {
  const db = createAdminClient();
  const { data } = await db
    .from("leave_requests")
    .select("id, session_id, student_id, parent_id, status, makeup_session_id, students(full_name), sessions!leave_requests_session_id_fkey(session_date, start_time, classes(name))")
    .eq("id", id)
    .maybeSingle();
  return data as any;
}

// Approve: excuse the student for that session + optionally book a makeup.
export async function approveLeave(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("id"));
  const makeup = String(formData.get("makeup_session_id") ?? "").trim() || null;

  const leave = await loadLeave(id);
  if (!leave) return;

  const supabase = await createClient(); // RLS: admin, branch-scoped via session
  const { error } = await supabase
    .from("leave_requests")
    .update({
      status: "approved",
      makeup_session_id: makeup,
      decided_by: me.id,
      decided_at: new Date().toISOString(),
    })
    .eq("id", id);
  if (error) return;

  // The approved leave IS the excused absence — write it now so the flag cron
  // doesn't mark the child absent later.
  await supabase.from("attendance").upsert(
    {
      session_id: leave.session_id,
      student_id: leave.student_id,
      status: "excused",
      flagged: false,
      flag_reason: "Approved leave",
    },
    { onConflict: "session_id,student_id" },
  );

  // Tell the parent (in-app + push).
  let makeupLine = "";
  if (makeup) {
    const db = createAdminClient();
    const { data: ms } = await db
      .from("sessions")
      .select("session_date, start_time, classes(name)")
      .eq("id", makeup)
      .maybeSingle();
    if (ms) makeupLine = ` Makeup: ${(ms as any).classes?.name ?? "class"} on ${formatDate((ms as any).session_date)} ${formatTime((ms as any).start_time)}.`;
  }
  const when = `${formatDate(leave.sessions?.session_date)} ${formatTime(leave.sessions?.start_time)}`;
  const body = `${leave.students?.full_name ?? "Your child"} is excused for ${leave.sessions?.classes?.name ?? "class"} on ${when}.${makeupLine}`;
  await createNotifications([leave.parent_id], { type: "leave_decision", title: "Leave approved", body, url: "/parent/schedule" });
  try { await pushToUsers([leave.parent_id], { title: "Leave approved", body, url: "/parent/schedule", tag: "leave" }); } catch { /* best-effort */ }

  revalidate();
}

export async function declineLeave(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("id"));
  const leave = await loadLeave(id);
  if (!leave) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: "declined", decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return;

  const when = `${formatDate(leave.sessions?.session_date)} ${formatTime(leave.sessions?.start_time)}`;
  const body = `Leave for ${leave.students?.full_name ?? "your child"} (${leave.sessions?.classes?.name ?? "class"}, ${when}) was declined — please contact the academy.`;
  await createNotifications([leave.parent_id], { type: "leave_decision", title: "Leave declined", body, url: "/parent/schedule" });
  try { await pushToUsers([leave.parent_id], { title: "Leave declined", body, url: "/parent/schedule", tag: "leave" }); } catch { /* best-effort */ }

  revalidate();
}

// Set / change the makeup on an already-approved leave.
export async function assignMakeup(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id"));
  const makeup = String(formData.get("makeup_session_id") ?? "").trim() || null;
  const leave = await loadLeave(id);
  if (!leave || leave.status !== "approved") return;

  const supabase = await createClient();
  const { error } = await supabase.from("leave_requests").update({ makeup_session_id: makeup }).eq("id", id);
  if (error) return;

  if (makeup) {
    const db = createAdminClient();
    const { data: ms } = await db
      .from("sessions")
      .select("session_date, start_time, classes(name)")
      .eq("id", makeup)
      .maybeSingle();
    const body = `Makeup for ${leave.students?.full_name ?? "your child"}: ${(ms as any)?.classes?.name ?? "class"} on ${formatDate((ms as any)?.session_date)} ${formatTime((ms as any)?.start_time)}.`;
    await createNotifications([leave.parent_id], { type: "leave_decision", title: "Makeup class booked", body, url: "/parent/schedule" });
    try { await pushToUsers([leave.parent_id], { title: "Makeup class booked", body, url: "/parent/schedule", tag: "leave" }); } catch { /* best-effort */ }
  }
  revalidate();
}

// ── Coach leave ──────────────────────────────────────────────────────────────
export async function decideCoachLeave(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) === "approved" ? "approved" : "declined";

  const db = createAdminClient();
  const { data: leave } = await db
    .from("coach_leave_requests")
    .select("id, coach_id, sessions(session_date, start_time, classes(name))")
    .eq("id", id)
    .maybeSingle();
  if (!leave) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_leave_requests")
    .update({ status: decision, decided_by: me.id, decided_at: new Date().toISOString() })
    .eq("id", id);
  if (error) return;

  const s = (leave as any).sessions;
  const when = `${formatDate(s?.session_date)} ${formatTime(s?.start_time)}`;
  await createNotifications([(leave as any).coach_id], {
    type: "leave_decision",
    title: `Leave ${decision}`,
    body: `Your leave for ${s?.classes?.name ?? "class"} on ${when} was ${decision}.`,
    url: "/coach/schedule",
  });

  revalidate();
}
