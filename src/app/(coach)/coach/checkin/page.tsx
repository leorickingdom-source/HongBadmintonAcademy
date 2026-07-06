import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { coachClassIds } from "../_data";
import { NfcScanner } from "@/components/nfc-scanner";
import { scanTap } from "./actions";
import { type Block } from "./checkin-board";
import { CheckinSwitcher } from "./checkin-switcher";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const me = await requireRole("coach");
  const supabase = await createClient();
  const classIds = await coachClassIds(supabase, me.id);
  const today = new Date().toLocaleDateString("en-CA");

  const { data: sessions } = classIds.length
    ? await supabase
        .from("sessions")
        .select("id, class_id, session_date, start_time, end_time, location, grace_minutes, classes(name)")
        .in("class_id", classIds)
        .eq("session_date", today)
        .order("start_time")
    : { data: [] as any[] };

  // Which of today's sessions the coach has checked into (showed up for).
  const sessIds = (sessions ?? []).map((s: any) => s.id);
  const { data: coachIns } = sessIds.length
    ? await supabase.from("coach_checkins").select("session_id").eq("coach_id", me.id).in("session_id", sessIds)
    : { data: [] as any[] };
  const coachedSet = new Set((coachIns ?? []).map((c: any) => c.session_id));

  const blocks: Block[] = [];
  for (const s of sessions ?? []) {
    const [{ data: enr }, { data: att }, { data: marks }, { data: makeups }] = await Promise.all([
      supabase
        .from("enrollments")
        .select("students(id, full_name, photo_url)")
        .eq("class_id", s.class_id)
        .eq("active", true),
      supabase
        .from("attendance")
        .select("student_id, status, tap_in_at")
        .eq("session_id", s.id),
      supabase
        .from("session_marks")
        .select("student_id, rating")
        .eq("session_id", s.id),
      // Students booked into THIS session as an approved makeup for a leave.
      supabase
        .from("leave_requests")
        .select("students(id, full_name, photo_url)")
        .eq("makeup_session_id", s.id)
        .eq("status", "approved"),
    ]);
    const attMap = new Map((att ?? []).map((a: any) => [a.student_id, a]));
    const markMap = new Map((marks ?? []).map((m: any) => [m.student_id, m.rating as number]));
    const roster = (enr ?? [])
      .map((e: any) => ({
        student: e.students,
        att: attMap.get(e.students?.id) ?? null,
        mark: markMap.get(e.students?.id) ?? null,
      }))
      .filter((r: any) => r.student);
    // Append makeup students not already on the roster, flagged like drop-ins.
    const have = new Set(roster.map((r: any) => r.student.id));
    for (const m of (makeups ?? []) as any[]) {
      const st = m.students;
      if (!st || have.has(st.id)) continue;
      roster.push({
        student: st,
        att: attMap.get(st.id) ?? null,
        mark: markMap.get(st.id) ?? null,
        dropIn: true,
      } as any);
    }
    blocks.push({ session: s as any, roster: roster as any, coachedIn: coachedSet.has(s.id) });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-in"
        description="Tap a name to mark present. Use ⋯ for late / absent or to rate, or + Add student for a drop-in."
      />

      {blocks.length === 0 ? (
        <EmptyState message="No sessions scheduled today." />
      ) : (
        <CheckinSwitcher blocks={blocks} nfc={<NfcScanner action={scanTap} />} />
      )}
    </div>
  );
}
