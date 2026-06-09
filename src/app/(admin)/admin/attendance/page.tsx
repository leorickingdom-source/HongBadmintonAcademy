import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function AttendancePage() {
  const supabase = await createClient();
  const today = new Date();
  const from = new Date(today);
  from.setDate(today.getDate() - 7);
  const to = new Date(today);
  to.setDate(today.getDate() + 7);

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, start_time, end_time, status, location, classes(name)")
    .gte("session_date", from.toLocaleDateString("en-CA"))
    .lte("session_date", to.toLocaleDateString("en-CA"))
    .order("session_date", { ascending: false })
    .order("start_time");

  const todayStr = today.toLocaleDateString("en-CA");

  return (
    <div>
      <PageHeader
        title="Attendance"
        description="Tap a session to open its roster and mark students."
      />

      {sessions && sessions.length > 0 ? (
        <div className="space-y-2">
          {sessions.map((s: any) => {
            const isToday = s.session_date === todayStr;
            return (
              <Link
                key={s.id}
                href={`/admin/attendance/${s.id}`}
                className={`flex items-center justify-between gap-3 rounded-xl border bg-white p-3.5 shadow-sm transition-all hover:border-green-300 hover:shadow ${isToday ? "border-green-300 ring-1 ring-green-200" : "border-slate-200"}`}
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-slate-900">{s.classes?.name ?? "Class"}</span>
                    {isToday && <Badge tone="green">Today</Badge>}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-slate-500">
                    {formatDate(s.session_date)} · {formatTime(s.start_time)}–{formatTime(s.end_time)} · {s.location ?? "—"}
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-2">
                  <Badge tone={s.status === "completed" ? "green" : "blue"}>{s.status}</Badge>
                  <span aria-hidden className="text-lg leading-none text-slate-300">›</span>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <EmptyState message="No sessions in the last/next 7 days. Generate sessions from a class." />
      )}
    </div>
  );
}
