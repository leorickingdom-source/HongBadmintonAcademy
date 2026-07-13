import Link from "next/link";
import { requireRole } from "@/lib/auth";
import { getViewBranchId } from "@/lib/branch";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, Table, Th, Td, Badge, EmptyState, cn } from "@/components/ui";
import { formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

// Did the coach show up + mark the roster? One row per recent session.
export default async function CoachCoveragePage() {
  const me = await requireRole("admin");
  const supabase = await createClient();
  const bf = await getViewBranchId(me);

  const today = new Date().toLocaleDateString("en-CA");
  const since = new Date(Date.now() - 30 * 86_400_000).toLocaleDateString("en-CA");

  let sq = supabase
    .from("sessions")
    .select("id, class_id, session_date, start_time, end_time, status, classes(name, coach_id, coach:profiles!classes_coach_id_fkey(full_name))")
    .gte("session_date", since)
    .lte("session_date", today)
    .neq("status", "canceled")
    .order("session_date", { ascending: false })
    .order("start_time")
    .limit(200);
  if (bf) sq = sq.eq("branch_id", bf);
  const { data: sessions } = await sq;

  const ids = (sessions ?? []).map((s: any) => s.id);
  const classIds = [...new Set((sessions ?? []).map((s: any) => s.class_id))];

  const empty = Promise.resolve({ data: [] as any[] });
  const [{ data: checkins }, { data: att }, { data: coCoaches }, { data: enr }] = await Promise.all([
    ids.length ? supabase.from("coach_checkins").select("session_id, coach_id, method, distance_m").in("session_id", ids) : empty,
    ids.length ? supabase.from("attendance").select("session_id, status").in("session_id", ids) : empty,
    classIds.length ? supabase.from("class_coaches").select("class_id, coach_id, profiles(full_name)").in("class_id", classIds) : empty,
    classIds.length ? supabase.from("enrollments").select("class_id").eq("active", true).in("class_id", classIds) : empty,
  ]);

  // session -> set of coach ids that checked in, + the geo proof (distance) when
  // the check-in captured a location (method 'self_geo').
  const checkedBySession = new Map<string, Set<string>>();
  const geoBySession = new Map<string, { distance_m: number | null; method: string }>();
  for (const c of (checkins ?? []) as any[]) {
    const s = checkedBySession.get(c.session_id) ?? new Set<string>();
    s.add(c.coach_id);
    checkedBySession.set(c.session_id, s);
    if (c.method === "self_geo") geoBySession.set(c.session_id, { distance_m: c.distance_m ?? null, method: c.method });
  }
  // session -> { marked, present }
  const attBySession = new Map<string, { marked: number; present: number }>();
  for (const a of (att ?? []) as any[]) {
    const e = attBySession.get(a.session_id) ?? { marked: 0, present: 0 };
    e.marked++;
    if (a.status === "present" || a.status === "late") e.present++;
    attBySession.set(a.session_id, e);
  }
  // class -> coach ids + names (primary + co)
  const coachesByClass = new Map<string, { id: string; name: string }[]>();
  for (const s of (sessions ?? []) as any[]) {
    if (coachesByClass.has(s.class_id)) continue;
    const list: { id: string; name: string }[] = [];
    if (s.classes?.coach_id) list.push({ id: s.classes.coach_id, name: s.classes.coach?.full_name ?? "Coach" });
    coachesByClass.set(s.class_id, list);
  }
  for (const cc of (coCoaches ?? []) as any[]) {
    const list = coachesByClass.get(cc.class_id) ?? [];
    if (!list.some((x) => x.id === cc.coach_id)) list.push({ id: cc.coach_id, name: cc.profiles?.full_name ?? "Coach" });
    coachesByClass.set(cc.class_id, list);
  }
  const rosterByClass = new Map<string, number>();
  for (const e of (enr ?? []) as any[]) rosterByClass.set(e.class_id, (rosterByClass.get(e.class_id) ?? 0) + 1);

  return (
    <div className="space-y-4">
      <PageHeader
        title="Coach coverage"
        description="Last 30 days — did the assigned coach check in, and was the roster marked?"
        action={<LinkButton href="/admin/attendance/matrix" variant="ghost">← Attendance</LinkButton>}
      />

      {sessions && sessions.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <Table>
            <thead>
              <tr>
                <Th>Date</Th><Th>Class</Th><Th>Coach</Th><Th>Coach checked in</Th><Th>Roster marked</Th>
              </tr>
            </thead>
            <tbody>
              {(sessions as any[]).map((s) => {
                const coaches = coachesByClass.get(s.class_id) ?? [];
                const checked = checkedBySession.get(s.id) ?? new Set<string>();
                const anyIn = coaches.some((c) => checked.has(c.id));
                const geo = geoBySession.get(s.id);
                const a = attBySession.get(s.id) ?? { marked: 0, present: 0 };
                const roster = rosterByClass.get(s.class_id) ?? 0;
                return (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <Td className="whitespace-nowrap font-medium text-slate-900">
                      <Link href={`/admin/attendance/${s.id}`} className="hover:text-green-700 hover:underline">
                        {formatDate(s.session_date)} · {formatTime(s.start_time)}
                      </Link>
                    </Td>
                    <Td className="text-slate-600">{s.classes?.name ?? "—"}</Td>
                    <Td className="text-slate-500">{coaches.length ? coaches.map((c) => c.name).join(", ") : "—"}</Td>
                    <Td>
                      {coaches.length === 0 ? (
                        <span className="text-slate-300">—</span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5">
                          <Badge tone={anyIn ? "green" : "red"}>{anyIn ? "yes" : "no"}</Badge>
                          {anyIn && geo && (
                            <span
                              className="text-xs text-slate-400"
                              title="Location verified at check-in (distance from academy)"
                            >
                              📍 {geo.distance_m != null ? `~${geo.distance_m} m` : "on-site"}
                            </span>
                          )}
                        </span>
                      )}
                    </Td>
                    <Td>
                      <span className={cn("font-medium", a.marked === 0 ? "text-red-600" : a.marked >= roster && roster > 0 ? "text-green-600" : "text-amber-600")}>
                        {a.marked === 0 ? "not marked" : `${a.marked}/${roster || a.marked}`}
                      </span>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        </div>
      ) : (
        <EmptyState message="No sessions in the last 30 days." />
      )}
    </div>
  );
}
