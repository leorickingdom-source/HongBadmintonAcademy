import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Section, EmptyState, Badge, LinkButton } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { coachClassIds } from "./_data";

export const dynamic = "force-dynamic";

export default async function CoachDashboard() {
  const me = await requireRole("coach");
  const supabase = await createClient();
  const classIds = await coachClassIds(supabase, me.id);
  const today = new Date().toLocaleDateString("en-CA");

  let sessions: any[] = [];
  let studentCount = 0;
  if (classIds.length) {
    const [{ data: s }, { count }] = await Promise.all([
      supabase
        .from("sessions")
        .select("id, start_time, end_time, location, status, classes(name)")
        .in("class_id", classIds)
        .eq("session_date", today)
        .order("start_time"),
      supabase
        .from("enrollments")
        .select("*", { count: "exact", head: true })
        .in("class_id", classIds)
        .eq("active", true),
    ]);
    sessions = s ?? [];
    studentCount = count ?? 0;
  }

  return (
    <div>
      <PageHeader
        title={`Welcome, ${me.full_name ?? "Coach"}`}
        description="Your classes and today's sessions."
        action={
          <>
            <LinkButton href="/coach/marking">Go to marking</LinkButton>
            <LinkButton href="/coach/attendance" variant="secondary">View attendance</LinkButton>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Your classes" value={classIds.length} />
        <StatCard label="Students" value={studentCount} tone="green" />
        <StatCard label="Sessions today" value={sessions.length} tone={sessions.length ? "blue" : "slate"} />
      </div>

      <div className="mt-8">
        <Section title="Today's sessions" flush>
          {sessions.length > 0 ? (
            <ul className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <li key={s.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <div className="font-medium text-slate-900">{s.classes?.name ?? "Class"}</div>
                    <div className="text-sm text-slate-500">
                      {formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.location ?? "—"}
                    </div>
                  </div>
                  <Badge tone={s.status === "completed" ? "green" : "blue"}>{s.status}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <div className="p-5"><EmptyState message="No sessions scheduled today." /></div>
          )}
        </Section>
      </div>
    </div>
  );
}
