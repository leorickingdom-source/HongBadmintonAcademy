import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Table, Th, Td, Badge, EmptyState, LinkButton, Button,
} from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BulkProvider, BulkSelectAll, BulkCheckbox, BulkBar } from "@/components/bulk-select";
import { SessionCalendar } from "@/components/session-calendar";
import { formatDate, formatTime } from "@/lib/format";
import { cancelSession, restoreSession, deleteSession, deleteSessions } from "./actions";

export const dynamic = "force-dynamic";

export default async function SessionsPage() {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA");

  const { data: sessions } = await supabase
    .from("sessions")
    .select("id, session_date, start_time, end_time, location, status, classes(name)")
    .gte("session_date", today)
    .order("session_date")
    .order("start_time")
    .limit(200);

  return (
    <div>
      <PageHeader
        title="Sessions"
        description="Every upcoming session across all classes. Cancel, restore or delete."
        action={
          <LinkButton href="/admin/classes" variant="secondary">
            + Generate (per class)
          </LinkButton>
        }
      />

      {sessions && sessions.length > 0 ? (
        <div className="space-y-6">
          <SessionCalendar
            sessions={(sessions as any[]).map((s) => ({
              id: s.id,
              session_date: s.session_date,
              start_time: s.start_time,
              end_time: s.end_time,
              location: s.location,
              status: s.status,
              className: s.classes?.name ?? null,
            }))}
          />

          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-600 hover:text-slate-900">
              <span className="select-none">▸ List &amp; bulk actions ({sessions.length})</span>
            </summary>
            <div className="mt-3">
          <BulkProvider>
            <Table>
              <thead>
                <tr>
                  <Th className="w-10"><BulkSelectAll /></Th>
                  <Th>Date</Th>
                  <Th>Time</Th>
                  <Th>Class</Th>
                  <Th>Location</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {(sessions as any[]).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td><BulkCheckbox id={s.id} /></Td>
                    <Td className="font-medium text-slate-900">{formatDate(s.session_date)}</Td>
                    <Td>{formatTime(s.start_time)}–{formatTime(s.end_time)}</Td>
                    <Td className="text-slate-600">{s.classes?.name ?? "—"}</Td>
                    <Td className="text-slate-500">{s.location ?? "—"}</Td>
                    <Td>
                      <Badge tone={s.status === "canceled" ? "red" : s.status === "completed" ? "green" : "blue"}>
                        {s.status}
                      </Badge>
                    </Td>
                    <Td className="text-right">
                      <div className="flex justify-end gap-2">
                        {s.status === "canceled" ? (
                          <form action={restoreSession}>
                            <input type="hidden" name="id" value={s.id} />
                            <Button type="submit" variant="secondary">Restore</Button>
                          </form>
                        ) : (
                          <form action={cancelSession}>
                            <input type="hidden" name="id" value={s.id} />
                            <Button type="submit" variant="secondary">Cancel</Button>
                          </form>
                        )}
                        <form action={deleteSession}>
                          <input type="hidden" name="id" value={s.id} />
                          <ConfirmButton label="Delete" confirmText="Delete this session?" />
                        </form>
                      </div>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
            <div className="px-5 pb-5">
              <BulkBar
                action={deleteSessions}
                label="session"
                confirmText="Delete {n} selected session(s)?"
              />
            </div>
          </BulkProvider>
            </div>
          </details>
        </div>
      ) : (
        <EmptyState message="No upcoming sessions. Generate them from a class's weekly schedule." />
      )}
    </div>
  );
}
