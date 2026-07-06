import { notFound } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, Badge, Table, Th, Td, LinkButton, EmptyState, Input, cn,
} from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatTime } from "@/lib/format";
import { rankBadgeClass } from "@/lib/ranks";
import type { AttendanceStatus } from "@/lib/types";
import { requestCoachLeave, withdrawCoachLeave } from "./leave-actions";
import { dict } from "@/lib/i18n";

export const dynamic = "force-dynamic";

const ATT_TONE: Record<string, "green" | "yellow" | "red" | "slate"> = {
  present: "green", late: "yellow", absent: "red", excused: "slate",
};

function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

// Coach-facing session detail. RLS limits `sessions` to the coach's own classes,
// so a session id outside their classes resolves to null -> notFound(). Read-only
// (cancel/delete are admin-only) with a shortcut to today's check-in board.
export default async function CoachSessionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; leave?: string }>;
}) {
  const { id } = await params;
  const { error, leave } = await searchParams;
  const me = await requireRole("coach");
  const L = dict(me.locale);
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("sessions")
    .select("id, class_id, session_date, start_time, end_time, location, status, classes(name, level)")
    .eq("id", id)
    .maybeSingle();
  if (!session) notFound();
  const s = session as any;
  const cls = s.classes;

  const [{ data: enrollments }, { data: attendance }, { data: myLeave }] = await Promise.all([
    supabase.from("enrollments").select("student_id, students(full_name)").eq("class_id", s.class_id).eq("active", true),
    supabase.from("attendance").select("student_id, status").eq("session_id", id),
    supabase.from("coach_leave_requests").select("status").eq("session_id", id).eq("coach_id", me.id).maybeSingle(),
  ]);

  const byStudent = new Map<string, string>();
  for (const a of (attendance ?? []) as any[]) byStudent.set(a.student_id, a.status);
  const roster = (enrollments ?? []) as any[];
  const canceled = s.status === "canceled";
  const isToday = s.session_date === todayMYT();
  const marked = roster.filter((e) => byStudent.has(e.student_id)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={cls?.name ?? L.session_word}
        description={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {cls?.level && (
              <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(cls.level))}>{cls.level}</span>
            )}
            <span>{formatDate(s.session_date)} · {formatTime(s.start_time)}–{formatTime(s.end_time)}</span>
            {s.location && <span>· 📍 {s.location}</span>}
            <Badge tone={canceled ? "red" : s.status === "completed" ? "green" : "blue"}>{s.status}</Badge>
          </span>
        }
        action={<LinkButton href="/coach/schedule" variant="ghost">← Schedule</LinkButton>}
      />

      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {leave === "sent" && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {L.leave_sent_admin}
        </p>
      )}

      {isToday && !canceled && (
        <div className="flex flex-wrap gap-2">
          <LinkButton href="/coach/checkin">{L.open_checkin} →</LinkButton>
        </div>
      )}

      {/* Coach leave — only for sessions that haven't happened yet. The wrapper id
          anchors the "Leave" deep-link from the coach schedule rows. */}
      {!canceled && s.session_date >= todayMYT() && (
        <div id="leave" className="scroll-mt-20">
        <Section title={L.cant_make_session}>
          {myLeave ? (
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={myLeave.status === "approved" ? "green" : myLeave.status === "declined" ? "red" : "yellow"}>
                {L.leave_prefix} {myLeave.status}
              </Badge>
              {myLeave.status === "pending" && (
                <form action={withdrawCoachLeave}>
                  <input type="hidden" name="session_id" value={id} />
                  <SubmitButton variant="secondary" pendingText="…">{L.withdraw_request}</SubmitButton>
                </form>
              )}
            </div>
          ) : (
            <form action={requestCoachLeave} className="flex flex-wrap items-center gap-2">
              <input type="hidden" name="session_id" value={id} />
              <Input name="reason" placeholder={L.reason_optional} maxLength={300} className="w-full sm:w-72" />
              <SubmitButton variant="secondary" pendingText="Sending…">{L.request_leave}</SubmitButton>
            </form>
          )}
        </Section>
        </div>
      )}

      <Section title={`${L.roster_word} (${roster.length}) · ${marked} ${L.marked_word}`} flush>
        {roster.length > 0 ? (
          <Table>
            <thead>
              <tr><Th>{L.student_col}</Th><Th>{L.attendance_this_session}</Th></tr>
            </thead>
            <tbody>
              {roster.map((e) => {
                const st = byStudent.get(e.student_id);
                const stLabel = st === "present" ? L.att_present : st === "late" ? L.att_late : st === "absent" ? L.att_absent : st === "excused" ? L.att_excused : st;
                return (
                  <tr key={e.student_id} className="hover:bg-slate-50">
                    <Td label={L.student_col} className="font-medium text-slate-900">{e.students?.full_name ?? e.student_id}</Td>
                    <Td label={L.attendance_this_session}>
                      {st ? <Badge tone={ATT_TONE[st as AttendanceStatus] ?? "slate"}>{stLabel}</Badge> : <span className="text-slate-400">{L.not_marked}</span>}
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        ) : (
          <div className="px-5 pt-5"><EmptyState message={L.no_enrolled_class} /></div>
        )}
      </Section>
    </div>
  );
}
