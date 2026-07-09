import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// A coach who is FREE to cover a given session, with a little ranking metadata.
export type EligibleCoach = {
  id: string;
  full_name: string | null;
  branch_id: string | null;
  sameBranch: boolean;
  sessionsThatDay: number;
};

export type SessionSlot = {
  sessionId: string;
  sessionDate: string; // YYYY-MM-DD
  startTime: string; // HH:MM[:SS]
  endTime: string;
  branchId: string | null;
  onLeaveCoachId: string;
};

// Coaches who can cover `slot` = every coach EXCEPT:
//  • the coach going on leave,
//  • anyone teaching their own session that overlaps the slot's time,
//  • anyone on approved leave for an overlapping session,
//  • anyone already confirmed to cover an overlapping session.
// Service-role read (names + session times aren't sensitive; every caller is
// already role-gated). Ranked: same branch first, then lightest day, then name.
export async function eligibleCoverCoaches(slot: SessionSlot): Promise<EligibleCoach[]> {
  const db = createAdminClient();
  const { sessionDate, startTime, endTime, branchId, onLeaveCoachId } = slot;

  const [{ data: coaches }, { data: daySess }] = await Promise.all([
    db.from("profiles").select("id, full_name, branch_id").eq("role", "coach"),
    db
      .from("sessions")
      .select("id, start_time, end_time, class_id, status, classes(coach_id)")
      .eq("session_date", sessionDate)
      .neq("status", "canceled"),
  ]);

  const overlaps = (s: any) => s.start_time < endTime && s.end_time > startTime;
  const busy = new Set<string>();
  const dayCount = new Map<string, number>();
  const overlapSessionIds: string[] = [];
  const overlapClassIds = new Set<string>();

  for (const s of (daySess ?? []) as any[]) {
    const primary = s.classes?.coach_id ?? null;
    if (primary) dayCount.set(primary, (dayCount.get(primary) ?? 0) + 1);
    if (overlaps(s)) {
      if (primary) busy.add(primary);
      overlapSessionIds.push(s.id);
      if (s.class_id) overlapClassIds.add(s.class_id);
    }
  }

  // Co-coaches of the overlapping classes are busy too.
  if (overlapClassIds.size) {
    const { data: cc } = await db
      .from("class_coaches")
      .select("coach_id")
      .in("class_id", [...overlapClassIds]);
    for (const r of (cc ?? []) as any[]) busy.add(r.coach_id);
  }

  // Coaches on approved leave for an overlapping session, or already confirmed
  // to cover one, are unavailable.
  if (overlapSessionIds.length) {
    const { data: lv } = await db
      .from("coach_leave_requests")
      .select("coach_id, replacement_coach_id")
      .eq("status", "approved")
      .in("session_id", overlapSessionIds);
    for (const r of (lv ?? []) as any[]) {
      if (r.coach_id) busy.add(r.coach_id);
      if (r.replacement_coach_id) busy.add(r.replacement_coach_id);
    }
  }

  busy.add(onLeaveCoachId);

  return ((coaches ?? []) as any[])
    .filter((c) => !busy.has(c.id))
    .map((c) => ({
      id: c.id,
      full_name: c.full_name ?? null,
      branch_id: c.branch_id ?? null,
      sameBranch: !!branchId && c.branch_id === branchId,
      sessionsThatDay: dayCount.get(c.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        Number(b.sameBranch) - Number(a.sameBranch) ||
        a.sessionsThatDay - b.sessionsThatDay ||
        String(a.full_name ?? "").localeCompare(String(b.full_name ?? "")),
    );
}

// Convenience: is this coach eligible to cover this slot? (server-action guard)
export async function isEligibleCover(slot: SessionSlot, coachId: string): Promise<boolean> {
  const list = await eligibleCoverCoaches(slot);
  return list.some((c) => c.id === coachId);
}
