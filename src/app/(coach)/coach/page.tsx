import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Card, EmptyState, Badge, LinkButton } from "@/components/ui";
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
      <PageHeader title={`Welcome, ${me.full_name ?? "Coach"}`} description="Your classes and today's sessions." />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Your classes" value={classIds.length} />
        <StatCard label="Students" value={studentCount} />
        <StatCard label="Sessions today" value={sessions.length} />
      </div>

      <div className="mt-8 flex gap-3">
        <LinkButton href="/coach/marking">Go to marking</LinkButton>
        <LinkButton href="/coach/attendance" variant="secondary">View attendance</LinkButton>
      </div>

      <div className="mt-8">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Today&apos;s sessions</h2>
        {sessions.length > 0 ? (
          <Card className="divide-y divide-slate-100">
            {sessions.map((s) => (
              <div key={s.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <div className="font-medium text-slate-800">{s.classes?.name ?? "Class"}</div>
                  <div className="text-sm text-slate-500">
                    {formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.location ?? "—"}
                  </div>
                </div>
                <Badge tone={s.status === "completed" ? "green" : "blue"}>{s.status}</Badge>
              </div>
            ))}
          </Card>
        ) : (
          <EmptyState message="No sessions scheduled today." />
        )}
      </div>
    </div>
  );
}
