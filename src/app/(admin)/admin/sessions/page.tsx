import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Section, Field, Input, Select, Table, Th, Td, Badge, EmptyState, LinkButton, Button, cn,
} from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BulkProvider, BulkSelectAll, BulkCheckbox, BulkBar } from "@/components/bulk-select";
import { MonthCalendar } from "@/components/month-calendar";
import { AddSessionModal } from "@/components/add-session-modal";
import { FilterSelect } from "@/components/filter-controls";
import { formatDate, formatTime } from "@/lib/format";
import { rankBadgeClass } from "@/lib/ranks";
import { loadHolidayMap } from "@/lib/holidays-server";
import type { SessionStatus } from "@/lib/types";
import { createSession, cancelSession, restoreSession, deleteSession, deleteSessions } from "./actions";

export const dynamic = "force-dynamic";

const STATUSES: SessionStatus[] = ["scheduled", "in_progress", "completed", "canceled"];

// Today in Malaysia time, as YYYY-MM-DD.
function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; class?: string; status?: string; error?: string; created?: string }>;
}) {
  const { month, class: classParam, status, error, created } = await searchParams;
  const supabase = await createClient();

  // Displayed month (YYYY-MM), defaulting to the current MYT month.
  const monthStr = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : todayMYT().slice(0, 7);
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${monthStr}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const classFilter = classParam && /^[0-9a-f-]{36}$/i.test(classParam) ? classParam : "";
  const statusFilter = status && (STATUSES as string[]).includes(status) ? status : "";

  let sessQuery = supabase
    .from("sessions")
    .select("id, session_date, start_time, end_time, location, status, class_id, classes(name, level, coach:profiles!classes_coach_id_fkey(full_name))")
    .gte("session_date", start)
    .lte("session_date", end)
    .order("session_date")
    .order("start_time")
    .limit(400);
  if (classFilter) sessQuery = sessQuery.eq("class_id", classFilter);
  if (statusFilter) sessQuery = sessQuery.eq("status", statusFilter);

  const [{ data: sessions }, { data: classes }, holidays] = await Promise.all([
    sessQuery,
    supabase.from("classes").select("id, name").eq("is_active", true).order("name"),
    loadHolidayMap(supabase, start, end),
  ]);

  const list = (sessions ?? []) as any[];
  const filtered = Boolean(classFilter || statusFilter);

  return (
    <div>
      <PageHeader
        title="Sessions"
        description="Sessions by month — tap one for details."
        action={
          <>
            <AddSessionModal classes={classes ?? []} monthStr={monthStr} today={todayMYT()} />
            <LinkButton href="/admin/classes" variant="secondary">
              Generate (per class) →
            </LinkButton>
          </>
        }
      />

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {created && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Session added.
        </p>
      )}

      {/* Filters (auto-apply, soft navigation) — narrow the month's calendar + list. */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">Class</span>
          <FilterSelect name="class" defaultValue={classFilter} className="h-9 w-48">
            <option value="">All classes</option>
            {(classes ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </FilterSelect>
        </label>
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">Status</span>
          <FilterSelect name="status" defaultValue={statusFilter} className="h-9 w-40">
            <option value="">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </FilterSelect>
        </label>
        {filtered && (
          <LinkButton href={`/admin/sessions?month=${monthStr}`} variant="ghost">Clear</LinkButton>
        )}
      </div>

      <div className="space-y-6">
        <MonthCalendar
          monthStr={monthStr}
          holidays={holidays}
          sessions={list.map((s) => ({
            id: s.id,
            session_date: s.session_date,
            start_time: s.start_time,
            end_time: s.end_time,
            location: s.location,
            status: s.status,
            className: s.classes?.name ?? null,
            classRank: s.classes?.level ?? null,
            coachName: s.classes?.coach?.full_name ?? null,
          }))}
        />

        {list.length > 0 && (
          <details className="group">
            <summary className="cursor-pointer list-none text-sm font-medium text-slate-600 hover:text-slate-900">
              <span className="select-none">▸ List &amp; bulk actions ({list.length})</span>
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
                  <Th>Coach</Th>
                  <Th>Location</Th>
                  <Th>Status</Th>
                  <Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {list.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td><BulkCheckbox id={s.id} /></Td>
                    <Td className="font-medium">
                      <Link href={`/admin/sessions/${s.id}`} className="text-green-700 hover:underline">
                        {formatDate(s.session_date)}
                      </Link>
                    </Td>
                    <Td>{formatTime(s.start_time)}–{formatTime(s.end_time)}</Td>
                    <Td label="Class" className="text-slate-600">
                      <div className="flex items-center gap-2">
                        <span>{s.classes?.name ?? "—"}</span>
                        {s.classes?.level && (
                          <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(s.classes.level))}>
                            {s.classes.level}
                          </span>
                        )}
                      </div>
                    </Td>
                    <Td label="Coach" className="text-slate-500">{s.classes?.coach?.full_name ?? "—"}</Td>
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
        )}
      </div>
    </div>
  );
}
