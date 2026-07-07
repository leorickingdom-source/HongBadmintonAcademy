import "server-only";

const ymd = (d: Date) => d.toLocaleDateString("en-CA");

function add(map: Map<string, Set<string>>, key: string, val: string) {
  const s = map.get(key) ?? new Set<string>();
  s.add(val);
  map.set(key, s);
}

// Total coach pay for the month = Σ over coaches of (lessons in their classes ×
// their per-lesson rate). Mirrors the coach payroll page + admin coaches summary
// (coach_pay.pay_per_lesson × month's sessions for the coach's classes, incl.
// co-coached classes — each coach is paid for those sessions). `branchId` scopes
// to one branch's classes. Service-role or admin client.
export async function monthlyPayrollTotal(
  db: any,
  month: Date = new Date(),
  branchId: string | null = null,
): Promise<number> {
  const mStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const mEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1); // exclusive
  const start = ymd(mStart);
  const end = ymd(mEnd);

  const { data: rates } = await db.from("coach_pay").select("coach_id, pay_per_lesson");
  const rateByCoach = new Map<string, number>((rates ?? []).map((r: any) => [r.coach_id, Number(r.pay_per_lesson)]));
  if (rateByCoach.size === 0) return 0;

  const classesQ = db.from("classes").select("id, coach_id, branch_id");
  const { data: classes } = await (branchId ? classesQ.eq("branch_id", branchId) : classesQ);
  const scopeClassIds = new Set<string>((classes ?? []).map((c: any) => c.id));
  if (scopeClassIds.size === 0) return 0;

  const { data: coCoaches } = await db.from("class_coaches").select("class_id, coach_id");

  const classesByCoach = new Map<string, Set<string>>();
  for (const c of (classes ?? []) as any[]) if (c.coach_id) add(classesByCoach, c.coach_id, c.id);
  for (const cc of (coCoaches ?? []) as any[]) if (scopeClassIds.has(cc.class_id)) add(classesByCoach, cc.coach_id, cc.class_id);

  const { data: sessions } = await db
    .from("sessions")
    .select("class_id, session_date")
    .in("class_id", [...scopeClassIds])
    .gte("session_date", start)
    .lt("session_date", end);
  const countByClass = new Map<string, number>();
  for (const s of (sessions ?? []) as any[]) countByClass.set(s.class_id, (countByClass.get(s.class_id) ?? 0) + 1);

  let total = 0;
  for (const [coachId, classIds] of classesByCoach) {
    const rate = rateByCoach.get(coachId) ?? 0;
    if (!rate) continue;
    let lessons = 0;
    for (const cid of classIds) lessons += countByClass.get(cid) ?? 0;
    total += lessons * rate;
  }
  return Math.round(total);
}
