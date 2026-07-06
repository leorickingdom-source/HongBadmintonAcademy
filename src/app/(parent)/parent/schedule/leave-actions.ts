"use server";

import { revalidatePath } from "next/cache";
import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyAdmins } from "@/lib/notifications";
import { formatDate, formatTime } from "@/lib/format";

// Parent requests leave for one child on one upcoming session. Service-role
// client (parents have no Supabase session) — every row is verified against the
// cookie-resolved parent id before writing.
export async function requestLeave(input: {
  session_id: string;
  student_id: string;
  reason?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await requireParent();
  if (!input?.session_id || !input?.student_id) return { ok: false, error: "missing" };
  const reason = (input.reason ?? "").trim().slice(0, 300) || null;

  const db = createAdminClient();

  // The student must be this parent's child.
  const { data: child } = await db
    .from("students")
    .select("id, full_name, parent_id")
    .eq("id", input.student_id)
    .maybeSingle();
  if (!child || child.parent_id !== me.id) return { ok: false, error: "not your child" };

  // The session must exist, be upcoming and not canceled — and the child must be
  // enrolled in its class.
  const { data: session } = await db
    .from("sessions")
    .select("id, class_id, session_date, start_time, status, classes(name)")
    .eq("id", input.session_id)
    .maybeSingle();
  if (!session) return { ok: false, error: "session not found" };
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  if (session.status === "canceled") return { ok: false, error: "session is canceled" };
  if (session.session_date < today) return { ok: false, error: "session already past" };

  const { data: enrolled } = await db
    .from("enrollments")
    .select("id")
    .eq("class_id", session.class_id)
    .eq("student_id", child.id)
    .eq("active", true)
    .maybeSingle();
  if (!enrolled) return { ok: false, error: "not enrolled in this class" };

  const { error } = await db.from("leave_requests").upsert(
    {
      session_id: session.id,
      student_id: child.id,
      parent_id: me.id,
      reason,
      status: "pending",
      decided_by: null,
      decided_at: null,
    },
    { onConflict: "session_id,student_id" },
  );
  if (error) return { ok: false, error: error.message };

  await notifyAdmins({
    type: "leave_request",
    title: "Leave request",
    body: `${child.full_name} — ${(session as any).classes?.name ?? "class"} on ${formatDate(session.session_date)} ${formatTime(session.start_time)}${reason ? ` · ${reason}` : ""}`,
    url: "/admin/leave",
  });

  revalidatePath("/parent/schedule");
  revalidatePath("/parent");
  return { ok: true };
}

// Parent withdraws a still-pending request.
export async function cancelLeave(input: {
  session_id: string;
  student_id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await requireParent();
  if (!input?.session_id || !input?.student_id) return { ok: false, error: "missing" };

  const db = createAdminClient();
  const { error } = await db
    .from("leave_requests")
    .delete()
    .eq("session_id", input.session_id)
    .eq("student_id", input.student_id)
    .eq("parent_id", me.id)
    .eq("status", "pending");
  if (error) return { ok: false, error: error.message };

  revalidatePath("/parent/schedule");
  return { ok: true };
}
