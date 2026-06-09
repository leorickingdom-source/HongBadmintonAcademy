import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Section, EmptyState, Badge } from "@/components/ui";
import { formatTime } from "@/lib/format";
import { coachClassIds } from "./_data";

export const dynamic = "force-dynamic";

const COACH_ACTIONS = [
  { href: "/coach/marking", icon: "📊", title: "Marking", sub: "Score students this month" },
  { href: "/coach/attendance", icon: "📋", title: "Attendance", sub: "Today's tap-ins" },
];

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
      />

      <div className="mb-8 grid grid-cols-1 gap-3 sm:grid-cols-2">
        {COACH_ACTIONS.map((q) => (
          <Link
            key={q.href}
            href={q.href}
            className="group flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all hover:border-green-300 hover:shadow-sm"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-green-50 text-2xl">
              {q.icon}
            </span>
            <div className="min-w-0">
              <div className="font-semibold leading-tight text-slate-900">{q.title}</div>
              <div className="truncate text-xs text-slate-500">{q.sub}</div>
            </div>
          </Link>
        ))}
      </div>

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
