import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Th, Td, Badge, EmptyState, LinkButton } from "@/components/ui";
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
        description="Live tap-in / tap-out per session. Open a session to view its roster."
      />

      {sessions && sessions.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Date</Th><Th>Class</Th><Th>Time</Th><Th>Location</Th><Th>Status</Th><Th className="text-right">—</Th>
            </tr>
          </thead>
          <tbody>
            {sessions.map((s: any) => (
              <tr key={s.id} className={s.session_date === todayStr ? "bg-green-50/40" : undefined}>
                <Td className="font-medium text-slate-900">
                  {formatDate(s.session_date)}
                  {s.session_date === todayStr && <Badge tone="green">Today</Badge>}
                </Td>
                <Td>{s.classes?.name ?? "—"}</Td>
                <Td>{formatTime(s.start_time)}–{formatTime(s.end_time)}</Td>
                <Td>{s.location ?? "—"}</Td>
                <Td><Badge tone={s.status === "completed" ? "green" : "blue"}>{s.status}</Badge></Td>
                <Td className="text-right">
                  <LinkButton href={`/admin/attendance/${s.id}`} variant="secondary">
                    Roster
                  </LinkButton>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState message="No sessions in the last/next 7 days. Generate sessions from a class." />
      )}
    </div>
  );
}
