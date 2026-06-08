import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, EmptyState } from "@/components/ui";
import { formatTime, formatDateTime } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/types";
import { coachClassIds } from "../_data";

export const dynamic = "force-dynamic";

const TONE: Record<AttendanceStatus, "green" | "yellow" | "red" | "slate"> = {
  present: "green", late: "yellow", absent: "red", excused: "slate",
};

export default async function CoachAttendancePage() {
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

  const blocks = [];
  for (const s of sessions ?? []) {
    const [{ data: enr }, { data: att }] = await Promise.all([
      supabase.from("enrollments").select("students(id, full_name)").eq("class_id", s.class_id).eq("active", true),
      supabase.from("attendance").select("student_id, status, tap_in_at").eq("session_id", s.id),
    ]);
    const map = new Map((att ?? []).map((a: any) => [a.student_id, a]));
    const roster = (enr ?? []).map((e: any) => ({ student: e.students, att: map.get(e.students?.id) }));
    blocks.push({ session: s, roster });
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Attendance" description="Live tap status for today's sessions." />

      {blocks.length === 0 && <EmptyState message="No sessions scheduled today." />}

      {blocks.map(({ session, roster }) => (
        <Card key={session.id} className="p-5">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <div className="font-semibold text-slate-900">{(session as any).classes?.name ?? "Class"}</div>
              <div className="text-sm text-slate-500">
                {formatTime(session.start_time)}–{formatTime(session.end_time)} · {session.location ?? "—"}
              </div>
            </div>
          </div>
          <ul className="divide-y divide-slate-100">
            {roster.map((r) => (
              <li key={r.student?.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-700">{r.student?.full_name}</span>
                {r.att ? (
                  <span className="flex items-center gap-2">
                    <Badge tone={TONE[r.att.status as AttendanceStatus]}>{r.att.status}</Badge>
                    {r.att.tap_in_at && <span className="text-xs text-slate-400">{formatDateTime(r.att.tap_in_at)}</span>}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">not tapped</span>
                )}
              </li>
            ))}
            {roster.length === 0 && <li className="py-2 text-sm text-slate-400">No students enrolled.</li>}
          </ul>
        </Card>
      ))}
    </div>
  );
}
