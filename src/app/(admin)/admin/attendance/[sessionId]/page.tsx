import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Badge, Button, LinkButton, cn } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";
import type { AttendanceStatus } from "@/lib/types";
import { simulateTap, setAttendanceStatus, processFlags } from "../actions";

export const dynamic = "force-dynamic";

const TONE: Record<AttendanceStatus, "green" | "yellow" | "red" | "slate"> = {
  present: "green", late: "yellow", absent: "red", excused: "slate",
};

// Filled style for the active status button (one per status).
const STATUS_ON: Record<AttendanceStatus, string> = {
  present: "bg-green-600 text-white ring-green-600",
  late: "bg-amber-500 text-white ring-amber-500",
  absent: "bg-red-600 text-white ring-red-600",
  excused: "bg-slate-500 text-white ring-slate-500",
};
const ORDER: AttendanceStatus[] = ["present", "late", "absent", "excused"];

function tapTime(iso?: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleTimeString("en-MY", {
    hour: "numeric", minute: "2-digit", timeZone: "Asia/Kuala_Lumpur",
  });
}

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
  const roster = (enrollments ?? [])
    .map((e: any) => ({ student: e.students, att: byStudent.get(e.student_id) }))
    .sort((a, b) => (a.student?.full_name ?? "").localeCompare(b.student?.full_name ?? ""));

  const counts = { present: 0, late: 0, absent: 0, excused: 0, none: 0 };
  for (const r of roster) {
    if (!r.att) counts.none++;
    else counts[r.att.status as AttendanceStatus]++;
  }

  return (
    <div className="space-y-4">
      <PageHeader
        title={(session as any).classes?.name ?? "Session"}
        description={`${formatDate(session.session_date)} · ${formatTime(session.start_time)}–${formatTime(session.end_time)} · ${session.location ?? "—"}`}
        action={<LinkButton href="/admin/attendance" variant="ghost">← Sessions</LinkButton>}
      />

      {/* Compact tally + finalise — no tall stat cards to scroll past */}
      <Card className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold">
          <span className="text-green-600">{counts.present} present</span>
          <span className="text-amber-600">{counts.late} late</span>
          <span className="text-red-600">{counts.absent} absent</span>
          <span className="text-slate-500">{counts.excused} excused</span>
          {counts.none > 0 && <span className="text-slate-400">{counts.none} unmarked</span>}
        </div>
        <form action={processFlags}>
          <input type="hidden" name="session_id" value={sessionId} />
          <Button type="submit" variant="secondary" className="!px-3 !py-1.5 text-xs" title="Flag late tap-ins and mark no-shows absent">
            Finalise
          </Button>
        </form>
      </Card>

      {/* One tap sets the status. Big targets, no dropdowns. */}
      <div className="space-y-2">
        {roster.map((r) => {
          const cur = r.att?.status as AttendanceStatus | undefined;
          const tIn = tapTime(r.att?.tap_in_at);
          const tOut = tapTime(r.att?.tap_out_at);
          return (
            <div
              key={r.student.id}
              className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm sm:flex sm:items-center sm:gap-4"
            >
              <div className="min-w-0 sm:flex-1">
                <div className="flex items-center gap-2">
                  <span className="truncate font-medium text-slate-900">{r.student.full_name}</span>
                  {cur ? (
                    <Badge tone={TONE[cur]}>{cur}{r.att.flagged ? " ⚑" : ""}</Badge>
                  ) : (
                    <span className="text-xs text-slate-400">unmarked</span>
                  )}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                  {tIn && <span>in {tIn}{tOut ? ` · out ${tOut}` : ""}</span>}
                  <form action={simulateTap} className="inline">
                    <input type="hidden" name="session_id" value={sessionId} />
                    <input type="hidden" name="student_id" value={r.student.id} />
                    <button type="submit" className="text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline">
                      {r.att && !r.att.tap_out_at ? "tap out" : "tap in"}
                    </button>
                  </form>
                </div>
              </div>

              <form
                action={setAttendanceStatus}
                className="mt-2.5 grid grid-cols-4 gap-1.5 sm:mt-0 sm:w-80 sm:flex-shrink-0"
              >
                <input type="hidden" name="session_id" value={sessionId} />
                <input type="hidden" name="student_id" value={r.student.id} />
                {ORDER.map((st) => (
                  <button
                    key={st}
                    type="submit"
                    name="status"
                    value={st}
                    className={cn(
                      "rounded-lg px-1 py-2.5 text-xs font-semibold capitalize ring-1 ring-inset transition-colors",
                      cur === st
                        ? STATUS_ON[st]
                        : "bg-white text-slate-600 ring-slate-300 hover:bg-slate-50 active:bg-slate-100",
                    )}
                  >
                    {st}
                  </button>
                ))}
              </form>
            </div>
          );
        })}
        {roster.length === 0 && (
          <Card className="p-6 text-center text-sm text-slate-500">No students enrolled in this class.</Card>
        )}
      </div>
    </div>
  );
}
