"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { createNotifications } from "@/lib/notifications";
import { pushToUsers } from "@/lib/push";
import { formatDate, formatTime } from "@/lib/format";
import { eligibleCoverCoaches } from "@/lib/cover";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function revalidate() {
  revalidatePath("/admin/leave");
  revalidatePath("/parent/schedule");
  revalidatePath("/coach/checkin");
  revalidatePath("/coach");
  revalidatePath("/coach/schedule");
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
// Approve a coach's leave one of three ways (cover_mode):
//   'assign' — hand-pick a free replacement now (0053 behaviour) → cover_status 'filled'
//   'open'   — broadcast the cover to eligible coaches; they claim, admin confirms → 'open'
//   'none'   — approve with no cover
// …or decline. The public /admin/leave form drives cover_mode via the button.
export async function decideCoachLeave(formData: FormData) {
  const me = await requireRole("admin");
  const id = String(formData.get("id"));
  const decision = String(formData.get("decision")) === "approved" ? "approved" : "declined";
  const coverModeRaw = String(formData.get("cover_mode") ?? "assign");
  const coverMode = coverModeRaw === "open" || coverModeRaw === "none" ? coverModeRaw : "assign";
  const replacementRaw = String(formData.get("replacement_coach_id") ?? "").trim();
  const replacement_coach_id =
    decision === "approved" && coverMode === "assign" && UUID_RE.test(replacementRaw) ? replacementRaw : null;

  const db = createAdminClient();
  const { data: leave } = await db
    .from("coach_leave_requests")
    .select("id, session_id, coach_id, sessions(session_date, start_time, end_time, branch_id, classes(name))")
    .eq("id", id)
    .maybeSingle();
  if (!leave) return;

  const s = (leave as any).sessions;
  const when = `${formatDate(s?.session_date)} ${formatTime(s?.start_time)}`;
  const className = s?.classes?.name ?? "class";

  // Guard the hand-picked sub: must be a coach and not the one on leave.
  let finalReplacement: string | null = replacement_coach_id;
  if (finalReplacement) {
    if (finalReplacement === (leave as any).coach_id) {
      finalReplacement = null;
    } else {
      const { data: sub } = await db.from("profiles").select("role").eq("id", finalReplacement).maybeSingle();
      if (!sub || (sub as any).role !== "coach") finalReplacement = null;
    }
  }

  const opening = decision === "approved" && coverMode === "open";
  const cover_status = decision !== "approved" ? "none" : finalReplacement ? "filled" : opening ? "open" : "none";

  const supabase = await createClient();
  const { error } = await supabase
    .from("coach_leave_requests")
    .update({
      status: decision,
      decided_by: me.id,
      decided_at: new Date().toISOString(),
      replacement_coach_id: finalReplacement,
      cover_status,
      // Directly-assigned cover starts null = "awaiting the coach's Accept".
      replacement_accepted: null,
    })
    .eq("id", id);
  if (error) return;

  // Tell the requesting coach the outcome.
  let coachBody = `Your leave for ${className} on ${when} was ${decision}.`;
  if (finalReplacement) {
    const { data: subP } = await db.from("profiles").select("full_name").eq("id", finalReplacement).maybeSingle();
    coachBody += ` Cover: ${(subP as any)?.full_name ?? "another coach"}.`;
  } else if (opening) {
    coachBody += " We're asking other coaches to cover.";
  }
  await createNotifications([(leave as any).coach_id], {
    type: "leave_decision",
    title: `Leave ${decision}`,
    body: coachBody,
    url: "/coach/schedule",
  });

  // Assign path: ask the chosen sub to accept the cover (in-app + push). They
  // Accept/Decline on their dashboard — a decline reopens the slot to offers.
  if (finalReplacement && decision === "approved") {
    const { data: onLeaveP } = await db.from("profiles").select("full_name").eq("id", (leave as any).coach_id).maybeSingle();
    const covBody = `Please accept: cover ${className} on ${when} for ${(onLeaveP as any)?.full_name ?? "a colleague"}.`;
    await createNotifications([finalReplacement], {
      type: "coach_cover",
      title: "Cover request",
      body: covBody,
      url: "/coach",
    });
    try { await pushToUsers([finalReplacement], { title: "Cover request", body: covBody, url: "/coach", tag: "cover" }); } catch { /* best-effort */ }
  }

  // Open path: broadcast to every FREE coach so they can offer to cover.
  if (opening && s) {
    const eligible = await eligibleCoverCoaches({
      sessionId: (leave as any).session_id,
      sessionDate: s.session_date,
      startTime: s.start_time,
      endTime: s.end_time,
      branchId: s.branch_id ?? null,
      onLeaveCoachId: (leave as any).coach_id,
    });
    const ids = eligible.map((c) => c.id);
    if (ids.length) {
      const body = `Cover needed: ${className} on ${when}. Tap to offer.`;
      await createNotifications(ids, { type: "coach_cover", title: "Cover needed", body, url: "/coach" });
      try { await pushToUsers(ids, { title: "Cover needed", body, url: "/coach", tag: "cover" }); } catch { /* best-effort */ }
    }
  }

  revalidate();
}

// Admin confirms one coach's offer to cover an OPEN leave. Locks in the
// replacement, marks that offer confirmed + the rest declined, and notifies
// everyone. This is the human gate — an offer alone never assigns a cover.
export async function confirmCoverOffer(formData: FormData) {
  await requireRole("admin");
  const offerId = String(formData.get("offer_id") ?? "");
  if (!UUID_RE.test(offerId)) return;

  const db = createAdminClient();
  const { data: offer } = await db
    .from("coach_cover_offers")
    .select("id, leave_id, coach_id, status")
    .eq("id", offerId)
    .maybeSingle();
  if (!offer) return;

  const { data: leave } = await db
    .from("coach_leave_requests")
    .select("id, coach_id, cover_status, session_id, sessions(session_date, start_time, classes(name))")
    .eq("id", (offer as any).leave_id)
    .maybeSingle();
  if (!leave || (leave as any).cover_status === "filled") return; // already covered

  const s = (leave as any).sessions;
  const when = `${formatDate(s?.session_date)} ${formatTime(s?.start_time)}`;
  const className = s?.classes?.name ?? "class";
  const chosen = (offer as any).coach_id as string;

  // Lock the cover in. The coach claimed it themselves, so it's already accepted.
  await db
    .from("coach_leave_requests")
    .update({ replacement_coach_id: chosen, cover_status: "filled", replacement_accepted: true })
    .eq("id", (leave as any).id);

  // This offer confirmed; every other offer on the leave declined.
  await db.from("coach_cover_offers").update({ status: "confirmed" }).eq("id", offerId);
  await db
    .from("coach_cover_offers")
    .update({ status: "declined" })
    .eq("leave_id", (offer as any).leave_id)
    .neq("id", offerId);

  // Tell the chosen coach (in-app + push).
  const { data: onLeaveP } = await db.from("profiles").select("full_name").eq("id", (leave as any).coach_id).maybeSingle();
  const covBody = `You're covering ${className} on ${when} for ${(onLeaveP as any)?.full_name ?? "a colleague"}.`;
  await createNotifications([chosen], { type: "coach_cover", title: "You're covering a class", body: covBody, url: "/coach/schedule" });
  try { await pushToUsers([chosen], { title: "You're covering a class", body: covBody, url: "/coach/schedule", tag: "cover" }); } catch { /* best-effort */ }

  // Soft note to the coaches who offered but weren't picked.
  const { data: others } = await db
    .from("coach_cover_offers")
    .select("coach_id")
    .eq("leave_id", (offer as any).leave_id)
    .neq("id", offerId);
  const otherIds = [...new Set(((others ?? []) as any[]).map((o) => o.coach_id))];
  if (otherIds.length) {
    await createNotifications(otherIds, {
      type: "coach_cover",
      title: "Cover filled",
      body: `Thanks for offering — ${className} on ${when} is covered by another coach.`,
      url: "/coach",
    });
  }

  // Requesting coach: their class is now covered.
  await createNotifications([(leave as any).coach_id], {
    type: "leave_decision",
    title: "Cover confirmed",
    body: `${className} on ${when} will be covered.`,
    url: "/coach/schedule",
  });

  revalidate();
}

// Undo a confirmed/assigned cover: drop the replacement and re-open the slot to
// offers (fresh — old offers are cleared), tell the removed sub, and re-broadcast
// to whoever's free now. This is the "oops, wrong coach / they can't after all"
// button.
export async function reopenCover(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return;

  const db = createAdminClient();
  const { data: leave } = await db
    .from("coach_leave_requests")
    .select("id, coach_id, session_id, replacement_coach_id, sessions(session_date, start_time, end_time, branch_id, classes(name))")
    .eq("id", id)
    .maybeSingle();
  if (!leave) return;

  const s = (leave as any).sessions;
  const when = `${formatDate(s?.session_date)} ${formatTime(s?.start_time)}`;
  const className = s?.classes?.name ?? "class";
  const removed = (leave as any).replacement_coach_id as string | null;

  await db
    .from("coach_leave_requests")
    .update({ replacement_coach_id: null, cover_status: "open", replacement_accepted: null })
    .eq("id", id);
  await db.from("coach_cover_offers").delete().eq("leave_id", id);

  // Tell the coach who was covering that they're off the hook.
  if (removed) {
    const body = `You're no longer covering ${className} on ${when}.`;
    await createNotifications([removed], { type: "coach_cover", title: "Cover removed", body, url: "/coach" });
    try { await pushToUsers([removed], { title: "Cover removed", body, url: "/coach", tag: "cover" }); } catch { /* best-effort */ }
  }

  // Re-broadcast to everyone free now.
  if (s) {
    const eligible = await eligibleCoverCoaches({
      sessionId: (leave as any).session_id,
      sessionDate: s.session_date,
      startTime: s.start_time,
      endTime: s.end_time,
      branchId: s.branch_id ?? null,
      onLeaveCoachId: (leave as any).coach_id,
    });
    const ids = eligible.map((c) => c.id).filter((cid) => cid !== removed);
    if (ids.length) {
      const body = `Cover needed: ${className} on ${when}. Tap to offer.`;
      await createNotifications(ids, { type: "coach_cover", title: "Cover needed", body, url: "/coach" });
      try { await pushToUsers(ids, { title: "Cover needed", body, url: "/coach", tag: "cover" }); } catch { /* best-effort */ }
    }
  }

  revalidate();
}

// Stop asking coaches to cover (open → none). Clears any pending offers.
export async function cancelCoverSearch(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id") ?? "");
  if (!UUID_RE.test(id)) return;

  const db = createAdminClient();
  await db.from("coach_cover_offers").delete().eq("leave_id", id);
  await db
    .from("coach_leave_requests")
    .update({ cover_status: "none", replacement_coach_id: null })
    .eq("id", id);

  revalidate();
}

// ── Undo a decided leave (send it back to Pending) ───────────────────────────
// Student leave: revert to pending, drop the auto-excusal + any makeup, tell the
// parent it's back under review.
export async function reopenStudentLeave(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id"));
  if (!UUID_RE.test(id)) return;

  const leave = await loadLeave(id);
  if (!leave) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .update({ status: "pending", decided_by: null, decided_at: null, makeup_session_id: null })
    .eq("id", id);
  if (error) return;

  // Remove the "excused" attendance the approval wrote, so the child isn't left
  // excused for a session whose leave is no longer decided.
  await supabase
    .from("attendance")
    .delete()
    .eq("session_id", leave.session_id)
    .eq("student_id", leave.student_id)
    .eq("status", "excused");

  const when = `${formatDate(leave.sessions?.session_date)} ${formatTime(leave.sessions?.start_time)}`;
  const body = `The leave for ${leave.students?.full_name ?? "your child"} (${leave.sessions?.classes?.name ?? "class"}, ${when}) is being reviewed again.`;
  await createNotifications([leave.parent_id], { type: "leave_decision", title: "Leave reopened", body, url: "/parent/schedule" });
  try { await pushToUsers([leave.parent_id], { title: "Leave reopened", body, url: "/parent/schedule", tag: "leave" }); } catch { /* best-effort */ }

  revalidate();
}

// Coach leave: revert to pending, tear down any cover (replacement + offers),
// and tell the coach + any removed sub.
export async function reopenCoachLeave(formData: FormData) {
  await requireRole("admin");
  const id = String(formData.get("id"));
  if (!UUID_RE.test(id)) return;

  const db = createAdminClient();
  const { data: leave } = await db
    .from("coach_leave_requests")
    .select("id, coach_id, replacement_coach_id, sessions(session_date, start_time, classes(name))")
    .eq("id", id)
    .maybeSingle();
  if (!leave) return;

  const removed = (leave as any).replacement_coach_id as string | null;
  await db.from("coach_cover_offers").delete().eq("leave_id", id);
  await db
    .from("coach_leave_requests")
    .update({ status: "pending", decided_by: null, decided_at: null, replacement_coach_id: null, cover_status: "none", replacement_accepted: null })
    .eq("id", id);

  const s = (leave as any).sessions;
  const when = `${formatDate(s?.session_date)} ${formatTime(s?.start_time)}`;
  const className = s?.classes?.name ?? "class";

  await createNotifications([(leave as any).coach_id], {
    type: "leave_decision",
    title: "Leave reopened",
    body: `Your leave for ${className} on ${when} is being reviewed again.`,
    url: "/coach/schedule",
  });
  if (removed) {
    const body = `You're no longer covering ${className} on ${when}.`;
    await createNotifications([removed], { type: "coach_cover", title: "Cover removed", body, url: "/coach" });
    try { await pushToUsers([removed], { title: "Cover removed", body, url: "/coach", tag: "cover" }); } catch { /* best-effort */ }
  }

  revalidate();
}
