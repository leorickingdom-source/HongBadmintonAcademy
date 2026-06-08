import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Card, Table, Th, Td, Badge, Button, Select, LinkButton, StatCard,
} from "@/components/ui";
import { formatDate, formatTime, formatDateTime } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/types";
import { simulateTap, setAttendanceStatus, processFlags } from "../actions";

export const dynamic = "force-dynamic";

const TONE: Record<AttendanceStatus, "green" | "yellow" | "red" | "slate"> = {
  present: "green", late: "yellow", absent: "red", excused: "slate",
};

export default async function RosterPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("*, classes(name)")
    .eq("id", sessionId)
    .maybeSingle();
  if (!session) notFound();

  const [{ data: enrollments }, { data: attendance }] = await Promise.all([
    supabase
      .from("enrollments")
      .select("student_id, students(id, full_name, nfc_tag_uid)")
      .eq("class_id", session.class_id)
      .eq("active", true),
    supabase.from("attendance").select("*").eq("session_id", sessionId),
  ]);

  const byStudent = new Map((attendance ?? []).map((a: any) => [a.student_id, a]));
  const roster = (enrollments ?? []).map((e: any) => ({
    student: e.students,
    att: byStudent.get(e.student_id),
  }));

  const counts = { present: 0, late: 0, absent: 0, excused: 0, none: 0 };
  for (const r of roster) {
    if (!r.att) counts.none++;
    else counts[r.att.status as AttendanceStatus]++;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={(session as any).classes?.name ?? "Session"}
        description={`${formatDate(session.session_date)} · ${formatTime(session.start_time)}–${formatTime(session.end_time)} · ${session.location ?? "—"}`}
        action={<LinkButton href="/admin/attendance" variant="secondary">← All sessions</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <StatCard label="Present" value={counts.present} />
        <StatCard label="Late" value={counts.late} />
        <StatCard label="Absent" value={counts.absent} />
        <StatCard label="Excused" value={counts.excused} />
        <StatCard label="Not tapped" value={counts.none} />
      </div>

      <Card className="flex items-center justify-between p-4">
        <p className="text-sm text-slate-600">
          Finalise: flag late tap-ins and mark no-shows as absent.
        </p>
        <form action={processFlags}>
          <input type="hidden" name="session_id" value={sessionId} />
          <Button type="submit" variant="secondary">Process flags</Button>
        </form>
      </Card>

      <Table>
        <thead>
          <tr>
            <Th>Student</Th><Th>Tag</Th><Th>Status</Th><Th>Tap in</Th><Th>Tap out</Th>
            <Th className="text-right">Actions</Th>
          </tr>
        </thead>
        <tbody>
          {roster.map((r) => (
            <tr key={r.student.id}>
              <Td className="font-medium text-slate-900">{r.student.full_name}</Td>
              <Td>{r.student.nfc_tag_uid ? <code className="text-xs">{r.student.nfc_tag_uid}</code> : "—"}</Td>
              <Td>
                {r.att ? (
                  <Badge tone={TONE[r.att.status as AttendanceStatus]}>
                    {r.att.status}{r.att.flagged ? " ⚑" : ""}
                  </Badge>
                ) : (
                  <span className="text-slate-400">not tapped</span>
                )}
              </Td>
              <Td>{r.att?.tap_in_at ? formatDateTime(r.att.tap_in_at) : "—"}</Td>
              <Td>{r.att?.tap_out_at ? formatDateTime(r.att.tap_out_at) : "—"}</Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <form action={simulateTap}>
                    <input type="hidden" name="session_id" value={sessionId} />
                    <input type="hidden" name="student_id" value={r.student.id} />
                    <Button type="submit" variant="secondary">
                      {r.att && !r.att.tap_out_at ? "Tap out" : "Tap in"}
                    </Button>
                  </form>
                  <form action={setAttendanceStatus} className="flex items-center gap-1">
                    <input type="hidden" name="session_id" value={sessionId} />
                    <input type="hidden" name="student_id" value={r.student.id} />
                    <Select name="status" defaultValue={r.att?.status ?? "present"} className="py-1">
                      <option value="present">present</option>
                      <option value="late">late</option>
                      <option value="absent">absent</option>
                      <option value="excused">excused</option>
                    </Select>
                    <Button type="submit" variant="ghost">Set</Button>
                  </form>
                </div>
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
