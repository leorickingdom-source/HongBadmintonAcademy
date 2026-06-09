import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, EmptyState, StatCard, Card } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { setCoachRate } from "../../_people/actions";

export const dynamic = "force-dynamic";

// Month bounds in Malaysia time (offset 0 = this month, -1 = last month).
function monthBounds(offset = 0) {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const y = now.getUTCFullYear();
  const m = now.getUTCMonth() + offset;
  const start = new Date(Date.UTC(y, m, 1));
  const end = new Date(Date.UTC(y, m + 1, 0));
  const fmt = (d: Date) => d.toISOString().slice(0, 10);
  return {
    start: fmt(start),
    end: fmt(end),
    label: start.toLocaleDateString("en-MY", { month: "long", year: "numeric", timeZone: "UTC" }),
  };
}

export default async function CoachSummaryPage() {
  const supabase = await createClient();
  const tm = monthBounds(0);
  const lm = monthBounds(-1);

  const [{ data: coaches }, { data: classes }, { data: ccs }] = await Promise.all([
    supabase.from("profiles").select("id, full_name, pay_per_lesson").eq("role", "coach").eq("is_active", true).order("full_name"),
    supabase.from("classes").select("id, coach_id"),
    supabase.from("class_coaches").select("class_id, coach_id"),
  ]);

  const { data: sess } = await supabase
    .from("sessions")
    .select("id, class_id, session_date")
    .gte("session_date", lm.start)
    .lte("session_date", tm.end);

  const thisIds = (sess ?? []).filter((s: any) => s.session_date >= tm.start).map((s: any) => s.id);
  const { data: att } = thisIds.length
    ? await supabase.from("attendance").select("session_id, status").in("session_id", thisIds)
    : { data: [] as any[] };

  const attBySession = new Map<string, { att: number; total: number }>();
  for (const a of att ?? []) {
    const e = attBySession.get(a.session_id) ?? { att: 0, total: 0 };
    e.total++;
    if (a.status === "present" || a.status === "late") e.att++;
    attBySession.set(a.session_id, e);
  }

  function classIdsFor(coachId: string): Set<string> {
    const set = new Set<string>();
    for (const c of classes ?? []) if (c.coach_id === coachId) set.add(c.id);
    for (const cc of ccs ?? []) if (cc.coach_id === coachId) set.add(cc.class_id);
    return set;
  }

  const rows = (coaches ?? []).map((co: any) => {
    const ids = classIdsFor(co.id);
    const thisSess = (sess ?? []).filter((s: any) => ids.has(s.class_id) && s.session_date >= tm.start);
    const lastSess = (sess ?? []).filter((s: any) => ids.has(s.class_id) && s.session_date < tm.start);
    const rate = Number(co.pay_per_lesson ?? 0);
    let a = 0;
    let t = 0;
    for (const s of thisSess) {
      const e = attBySession.get(s.id);
      if (e) { a += e.att; t += e.total; }
    }
    return {
      id: co.id,
      name: co.full_name ?? "Coach",
      rate,
      thisLessons: thisSess.length,
      thisPay: thisSess.length * rate,
      lastLessons: lastSess.length,
      lastPay: lastSess.length * rate,
      attPct: t ? Math.round((a / t) * 100) : null,
    };
  });

  const totalLessons = thisIds.length;
  const totalPay = rows.reduce((x, r) => x + r.thisPay, 0);
  let oa = 0;
  let ot = 0;
  for (const e of attBySession.values()) { oa += e.att; ot += e.total; }
  const overallPct = ot ? Math.round((oa / ot) * 100) : 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Coaches Summary"
        description={`Lessons & auto-calculated payroll · ${tm.label}`}
        action={<LinkButton href="/admin/coaches" variant="ghost">Manage coaches →</LinkButton>}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Active coaches" value={rows.length} />
        <StatCard label="Lessons" value={totalLessons} sub={tm.label} />
        <StatCard label="Attendance" value={`${overallPct}%`} tone={overallPct >= 70 ? "green" : "amber"} sub="this month" />
        <StatCard label="Total payroll" value={formatCurrency(totalPay)} tone="green" sub="auto-calculated" />
      </div>

      {rows.length === 0 ? (
        <EmptyState message="No active coaches yet." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <Card key={r.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="font-semibold text-green-700">{r.name}</div>
                <form action={setCoachRate} className="flex items-center gap-1.5 text-xs text-slate-500">
                  <input type="hidden" name="id" value={r.id} />
                  <span>RM</span>
                  <input
                    name="rate"
                    type="number"
                    min="0"
                    step="10"
                    defaultValue={r.rate}
                    className="w-20 rounded-md border border-slate-300 px-2 py-1 text-sm text-slate-900"
                  />
                  <span>/lesson</span>
                  <button type="submit" className="rounded-md bg-slate-800 px-2.5 py-1 font-medium text-white hover:bg-slate-700">
                    Save
                  </button>
                </form>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">This month</div>
                  <div className="mt-1 text-sm text-slate-700">
                    {r.thisLessons} lessons · {r.attPct != null ? `${r.attPct}% attendance` : "no data"}
                  </div>
                  <div className="mt-1 text-lg font-bold text-green-700">{formatCurrency(r.thisPay)}</div>
                </div>
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous month</div>
                  <div className="mt-1 text-sm text-slate-700">{r.lastLessons} lessons</div>
                  <div className="mt-1 text-lg font-bold text-slate-700">{formatCurrency(r.lastPay)}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
