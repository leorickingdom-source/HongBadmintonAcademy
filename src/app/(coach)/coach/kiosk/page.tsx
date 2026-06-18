import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { coachClassIds } from "../_data";
import { KioskBoard, type KioskBlock } from "./kiosk-board";

export const dynamic = "force-dynamic";

// Student self check-in kiosk: a shared court-side tablet the coach opens. Big
// name tiles; each student taps their own to mark present — no NFC tag needed.
// Reuses the same attendance store as the coach board (setAttendanceAction).
export default async function KioskPage() {
  const me = await requireRole("coach");
  const supabase = await createClient();
  const classIds = await coachClassIds(supabase, me.id);
  const today = new Date().toLocaleDateString("en-CA");

  const { data: sessions } = classIds.length
    ? await supabase
        .from("sessions")
        .select("id, class_id, start_time, end_time, location, classes(name)")
        .in("class_id", classIds)
        .eq("session_date", today)
        .order("start_time")
    : { data: [] as any[] };

  const blocks: KioskBlock[] = [];
  for (const s of sessions ?? []) {
    const [{ data: enr }, { data: att }] = await Promise.all([
      supabase
        .from("enrollments")
        .select("students(id, full_name)")
        .eq("class_id", s.class_id)
        .eq("active", true),
      supabase
        .from("attendance")
        .select("student_id, status, tap_in_at")
        .eq("session_id", s.id),
    ]);
    const attMap = new Map((att ?? []).map((a: any) => [a.student_id, a]));
    const roster = (enr ?? [])
      .map((e: any) => ({ student: e.students, att: attMap.get(e.students?.id) ?? null }))
      .filter((r: any) => r.student)
      .sort((a: any, b: any) => String(a.student.full_name).localeCompare(String(b.student.full_name)));
    blocks.push({ session: s as any, roster: roster as any });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Kiosk check-in"
        description="Leave this open on a court-side tablet. Each student taps their own name to check in — no NFC card needed."
      />
      {blocks.length === 0 ? (
        <EmptyState message="No sessions scheduled today." />
      ) : (
        <KioskBoard initialBlocks={blocks} />
      )}
    </div>
  );
}
