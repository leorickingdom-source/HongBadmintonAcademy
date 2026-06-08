import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Table, Th, Td, Badge, EmptyState, LinkButton } from "@/components/ui";
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
        <Section title="Sessions (last & next 7 days)" flush>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th><Th>Class</Th><Th>Time</Th><Th>Location</Th><Th>Status</Th><Th className="text-right">—</Th>
              </tr>
            </thead>
            <tbody>
              {sessions.map((s: any) => (
                <tr key={s.id} className={s.session_date === todayStr ? "bg-green-50/60" : "hover:bg-slate-50"}>
                  <Td className="font-medium text-slate-900">
                    <span className="inline-flex items-center gap-2">
                      {formatDate(s.session_date)}
                      {s.session_date === todayStr && <Badge tone="green">Today</Badge>}
                    </span>
                  </Td>
                  <Td className="text-slate-500">{s.classes?.name ?? "—"}</Td>
                  <Td>{formatTime(s.start_time)}–{formatTime(s.end_time)}</Td>
                  <Td className="text-slate-500">{s.location ?? "—"}</Td>
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
        </Section>
      ) : (
        <EmptyState message="No sessions in the last/next 7 days. Generate sessions from a class." />
      )}
    </div>
  );
}
