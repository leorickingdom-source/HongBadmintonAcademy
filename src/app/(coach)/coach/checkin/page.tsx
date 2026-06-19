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

  const blocks: Block[] = [];
  for (const s of sessions ?? []) {
    const [{ data: enr }, { data: att }, { data: marks }] = await Promise.all([
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
    blocks.push({ session: s as any, roster: roster as any });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Check-in"
        description="Coach board (NFC + manual) or Kiosk mode where students tap their own name. Late taps auto-flag after the grace window."
      />

      <NfcScanner action={scanTap} />

      {blocks.length === 0 ? (
        <EmptyState message="No sessions scheduled today." />
      ) : (
        <CheckinSwitcher blocks={blocks} />
      )}
    </div>
  );
}
