import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, Badge, Table, Th, Td, Button, LinkButton, EmptyState, cn,
} from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate, formatTime } from "@/lib/format";
import { rankBadgeClass } from "@/lib/ranks";
import type { AttendanceStatus } from "@/lib/types";
import { cancelSession, restoreSession, removeSession } from "../actions";

export const dynamic = "force-dynamic";

const ATT_TONE: Record<string, "green" | "yellow" | "red" | "slate"> = {
  present: "green", late: "yellow", absent: "red", excused: "slate",
};

export default async function SessionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, class_id, session_date, start_time, end_time, location, status, grace_minutes, classes(name, level, coach:profiles!classes_coach_id_fkey(full_name))")
    .eq("id", id)
    .maybeSingle();

  if (!session) notFound();
  const s = session as any;
  const cls = s.classes;

  const [{ data: enrollments }, { data: attendance }] = await Promise.all([
    supabase.from("enrollments").select("student_id, students(full_name)").eq("class_id", s.class_id).eq("active", true),
    supabase.from("attendance").select("student_id, status").eq("session_id", id),
  ]);

  const statusByStudent = new Map<string, string>();
  for (const a of (attendance ?? []) as any[]) statusByStudent.set(a.student_id, a.status);

  const roster = (enrollments ?? []) as any[];
  const canceled = s.status === "canceled";

  return (
    <div className="space-y-6">
      <PageHeader
        title={cls?.name ?? "Session"}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {cls?.level && (
              <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(cls.level))}>{cls.level}</span>
            )}
            <span>{formatDate(s.session_date)} · {formatTime(s.start_time)}–{formatTime(s.end_time)}</span>
            <span>· 📍 {s.location ?? "—"}</span>
            <span>· 🎯 {cls?.coach?.full_name ?? "No coach"}</span>
            <Badge tone={canceled ? "red" : s.status === "completed" ? "green" : "blue"}>{s.status}</Badge>
          </span>
        }
        action={<LinkButton href="/admin/sessions" variant="ghost">← Sessions</LinkButton>}
      />

      <Section title="Actions">
        <div className="flex flex-wrap gap-2">
          {canceled ? (
            <form action={restoreSession}>
              <input type="hidden" name="id" value={s.id} />
              <Button type="submit" variant="secondary">Restore session</Button>
            </form>
          ) : (
            <form action={cancelSession}>
              <input type="hidden" name="id" value={s.id} />
              <Button type="submit" variant="secondary">Cancel session</Button>
            </form>
          )}
          <form action={removeSession}>
            <input type="hidden" name="id" value={s.id} />
            <ConfirmButton label="Delete session" confirmText="Delete this session? This cannot be undone." />
          </form>
        </div>
      </Section>

      <Section title={`Enrolled students (${roster.length})`} flush>
        {roster.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>Student</Th><Th>Attendance this session</Th></tr>
            </thead>
            <tbody>
              {roster.map((e) => {
                const st = statusByStudent.get(e.student_id);
                return (
                  <tr key={e.student_id} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{e.students?.full_name ?? e.student_id}</Td>
                    <Td>
                      {st ? <Badge tone={ATT_TONE[st as AttendanceStatus] ?? "slate"}>{st}</Badge> : <span className="text-slate-400">not marked</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="px-5 pt-5"><EmptyState message="No students enrolled in this class." /></div>
        )}
      </Section>
    </div>
  );
}
