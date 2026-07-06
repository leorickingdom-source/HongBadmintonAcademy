import { formatDate, formatTime } from "@/lib/format";

export type MakeupOption = {
  id: string;
  label: string;
  // null = the class has no capacity set (no per-session limit configured).
  spotsLeft: number | null;
  full: boolean;
};

// Candidate makeup sessions for a child: upcoming, non-canceled sessions of
// classes at the same level (and branch) as the child's class. Each carries the
// remaining spots so parents/admins don't propose a session that's already at
// capacity. spotsLeft === null means the class has no capacity set — i.e. there
// is no per-session limit configured at the moment.
export async function getMakeupOptions(
  db: any,
  opts: { level: string | null; branchId: string | null; limit?: number },
): Promise<MakeupOption[]> {
  const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
  let q = db
    .from("sessions")
    .select("id, session_date, start_time, class_id, classes!inner(name, level, branch_id, capacity)")
    .gte("session_date", today)
    .neq("status", "canceled")
    .order("session_date")
    .order("start_time")
    .limit(opts.limit ?? 40);
  if (opts.level) q = q.eq("classes.level", opts.level);
  if (opts.branchId) q = q.eq("classes.branch_id", opts.branchId);

  const { data: rows } = await q;
  const sessions = (rows ?? []) as any[];
  if (!sessions.length) return [];

  const classIds = [...new Set(sessions.map((s) => s.class_id))];
  const sessionIds = sessions.map((s) => s.id);

  // Projected headcount per session = active enrollments in its class + makeups
  // already routed to that session. Conservative (a same-class makeup is double
  // counted), which errs toward under-filling — safe for a limit check.
  const [{ data: enr }, { data: mk }] = await Promise.all([
    db.from("enrollments").select("class_id").in("class_id", classIds).eq("active", true),
    db.from("leave_requests").select("makeup_session_id").in("makeup_session_id", sessionIds).eq("status", "approved"),
  ]);
  const enrolledBy = new Map<string, number>();
  for (const e of (enr ?? []) as any[]) enrolledBy.set(e.class_id, (enrolledBy.get(e.class_id) ?? 0) + 1);
  const makeupBy = new Map<string, number>();
  for (const m of (mk ?? []) as any[]) if (m.makeup_session_id) makeupBy.set(m.makeup_session_id, (makeupBy.get(m.makeup_session_id) ?? 0) + 1);

  return sessions.map((s) => {
    const cap = s.classes?.capacity ?? null;
    const used = (enrolledBy.get(s.class_id) ?? 0) + (makeupBy.get(s.id) ?? 0);
    const spotsLeft = cap == null ? null : Math.max(0, Number(cap) - used);
    return {
      id: s.id,
      label: `${s.classes?.name ?? "Class"} — ${formatDate(s.session_date)} ${formatTime(s.start_time)}`,
      spotsLeft,
      full: spotsLeft != null && spotsLeft <= 0,
    };
  });
}
