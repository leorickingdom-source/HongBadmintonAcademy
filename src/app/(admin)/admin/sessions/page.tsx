import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { getViewBranchId } from "@/lib/branch";
import { PageHeader, LinkButton } from "@/components/ui";
import { MonthCalendar } from "@/components/month-calendar";
import { AddSessionModal } from "@/components/add-session-modal";
import { FilterSelect } from "@/components/filter-controls";
import { loadHolidayMap } from "@/lib/holidays-server";
import { dict } from "@/lib/i18n";
import { createSession } from "./actions";

export const dynamic = "force-dynamic";

// Today in Malaysia time, as YYYY-MM-DD.
function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function SessionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; class?: string; error?: string; created?: string }>;
}) {
  const { month, class: classParam, error, created } = await searchParams;
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const supabase = await createClient();
  const bf = await getViewBranchId(me);

  // Displayed month (YYYY-MM), defaulting to the current MYT month.
  const monthStr = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : todayMYT().slice(0, 7);
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${monthStr}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);

  const classFilter = classParam && /^[0-9a-f-]{36}$/i.test(classParam) ? classParam : "";

  let sessQuery = supabase
    .from("sessions")
    .select("id, session_date, start_time, end_time, location, status, class_id, classes(name, level, coach:profiles!classes_coach_id_fkey(full_name))")
    .gte("session_date", start)
    .lte("session_date", end)
    .order("session_date")
    .order("start_time")
    .limit(400);
  if (classFilter) sessQuery = sessQuery.eq("class_id", classFilter);
  if (bf) sessQuery = sessQuery.eq("branch_id", bf);

  let classQuery = supabase.from("classes").select("id, name").eq("is_active", true).order("name");
  if (bf) classQuery = classQuery.eq("branch_id", bf);

  const [{ data: sessions }, { data: classes }, holidays] = await Promise.all([
    sessQuery,
    classQuery,
    loadHolidayMap(supabase, start, end),
  ]);

  const list = (sessions ?? []) as any[];

  return (
    <div>
      <PageHeader
        title={L.sessions_title}
        description={L.sess_desc}
        action={
          <>
            <AddSessionModal classes={classes ?? []} monthStr={monthStr} today={todayMYT()} />
            <LinkButton href="/admin/attendance/coverage" variant="secondary">
              {L.sess_coach_coverage}
            </LinkButton>
            <LinkButton href="/admin/classes" variant="secondary">
              {L.sess_generate}
            </LinkButton>
          </>
        }
      />

      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {created && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {L.sess_added}
        </p>
      )}

      {/* Class filter — keep one knob so a single noisy class doesn't drown the
       *  month view. Status filter + bulk-action table were dropped — single
       *  sessions are managed on the session detail page now. */}
      <div className="mb-6 flex flex-wrap items-end gap-3">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-slate-600">{L.class_word}</span>
          <FilterSelect name="class" defaultValue={classFilter} className="h-9 w-48">
            <option value="">{L.adm_all_classes}</option>
            {(classes ?? []).map((c: any) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </FilterSelect>
        </label>
        {classFilter && (
          <LinkButton href={`/admin/sessions?month=${monthStr}`} variant="ghost">{L.clear_word}</LinkButton>
        )}
      </div>

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
    </div>
  );
}
