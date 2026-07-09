"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { notifyAdmins } from "@/lib/notifications";
import { isEligibleCover } from "@/lib/cover";
import { formatDate, formatTime } from "@/lib/format";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// A coach taps "I'll cover" on an open cover request. Guarded: the leave must
// still be open AND the coach must be actually free at that time (same rule the
// broadcast used). The offer is provisional — an admin confirms it (see
// confirmCoverOffer). RLS also re-checks open-ness on insert.
export async function makeCoverOffer(formData: FormData) {
  const me = await requireRole("coach");
  const leaveId = String(formData.get("leave_id") ?? "");
  if (!UUID_RE.test(leaveId)) return;

  const admin = createAdminClient();
  const { data: leave } = await admin
    .from("coach_leave_requests")
    .select("id, coach_id, session_id, cover_status, sessions(session_date, start_time, end_time, branch_id, classes(name))")
    .eq("id", leaveId)
    .maybeSingle();
  if (!leave || (leave as any).cover_status !== "open") return;
  if ((leave as any).coach_id === me.id) return; // your own leave

  const s = (leave as any).sessions;
  const ok = await isEligibleCover(
    {
      sessionId: (leave as any).session_id,
      sessionDate: s?.session_date,
      startTime: s?.start_time,
      endTime: s?.end_time,
      branchId: s?.branch_id ?? null,
      onLeaveCoachId: (leave as any).coach_id,
    },
    me.id,
  );
  if (!ok) return;

  // Insert through the RLS client so the coach's own insert policy applies.
  const db = await createClient();
  const { error } = await db.from("coach_cover_offers").insert({ leave_id: leaveId, coach_id: me.id });
  if (error) return; // unique violation (already offered) or policy — ignore

  // Let the admins know someone offered.
  const when = `${formatDate(s?.session_date)} ${formatTime(s?.start_time)}`;
  const className = s?.classes?.name ?? "class";
  try {
    await notifyAdmins({
      type: "coach_cover",
      title: "Coach offered to cover",
      body: `${me.full_name ?? "A coach"} offered to cover ${className} on ${when}.`,
      url: "/admin/leave",
    });
  } catch {
    // best-effort
  }

  revalidatePath("/coach");
  revalidatePath("/admin/leave");
}

// Withdraw a still-pending offer.
export async function withdrawCoverOffer(formData: FormData) {
  const me = await requireRole("coach");
  const leaveId = String(formData.get("leave_id") ?? "");
  if (!UUID_RE.test(leaveId)) return;

  const db = await createClient();
  await db.from("coach_cover_offers").delete().eq("leave_id", leaveId).eq("coach_id", me.id).eq("status", "offered");

  revalidatePath("/coach");
  revalidatePath("/admin/leave");
}
