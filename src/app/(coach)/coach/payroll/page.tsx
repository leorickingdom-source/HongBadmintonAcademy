import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Section, Table, Th, Td, EmptyState } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { coachClassIds } from "../_data";

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

export default async function CoachPayrollPage() {
  const me = await requireRole("coach");
  const supabase = await createClient();
  const tm = monthBounds(0);
  const lm = monthBounds(-1);

  const classIds = await coachClassIds(supabase, me.id);

  // Own rate (RLS lets a coach read only their own coach_pay row).
  const { data: payRow } = await supabase
    .from("coach_pay")
    .select("pay_per_lesson")
    .eq("coach_id", me.id)
    .maybeSingle();
  const rate = Number(payRow?.pay_per_lesson ?? 0);

  // Lessons (this + last month) and class names for the coach's classes.
  const [{ data: sess }, { data: classes }] = await Promise.all([
    classIds.length
      ? supabase
          .from("sessions")
          .select("id, session_date, class_id")
          .in("class_id", classIds)
          .gte("session_date", lm.start)
          .lte("session_date", tm.end)
      : Promise.resolve({ data: [] as any[] }),
    classIds.length
      ? supabase.from("classes").select("id, name").in("id", classIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const classNameById = new Map((classes ?? []).map((c: any) => [c.id, c.name as string]));

  const thisSess = (sess ?? []).filter((s: any) => s.session_date >= tm.start);
  const lastSess = (sess ?? []).filter((s: any) => s.session_date < tm.start);

  // Attendance % for this month's sessions (present or late counts as attended).
  const thisIds = thisSess.map((s: any) => s.id);
  const { data: att } = thisIds.length
    ? await supabase.from("attendance").select("status").in("session_id", thisIds)
    : { data: [] as any[] };
  const attended = (att ?? []).filter((a: any) => a.status === "present" || a.status === "late").length;
  const attPct = att && att.length ? Math.round((attended / att.length) * 100) : null;

  const thisPay = thisSess.length * rate;
  const lastPay = lastSess.length * rate;

  // Per-class breakdown for this month.
  const perClass = new Map<string, number>();
  for (const s of thisSess as any[]) perClass.set(s.class_id, (perClass.get(s.class_id) ?? 0) + 1);
  const classRows = [...perClass.entries()]
    .map(([cid, lessons]) => ({ name: classNameById.get(cid) ?? "Class", lessons, pay: lessons * rate }))
    .sort((a, b) => b.pay - a.pay);

  const money = (n: number) => formatCurrency(n, undefined, { whole: true });

  return (
    <div className="space-y-6">
      <PageHeader title="My Payroll" description={`Auto-calculated from lessons taught · ${tm.label}`} />

      {/* Headline — what you earned this month */}
      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
        <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Earned this month · {tm.label}</div>
        <div className="mt-1 text-4xl font-bold text-emerald-900">{money(thisPay)}</div>
        <div className="mt-1 text-sm text-emerald-800">
          {thisSess.length} lesson{thisSess.length === 1 ? "" : "s"} × {money(rate)} per lesson
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Pay rate" value={money(rate)} sub="per lesson" />
        <StatCard label="Attendance" value={attPct != null ? `${attPct}%` : "—"} tone={attPct != null && attPct >= 70 ? "green" : "amber"} sub="your classes" />
        <StatCard label="Last month" value={money(lastPay)} sub={`${lastSess.length} lessons · ${lm.label}`} />
      </div>

      {classRows.length > 0 ? (
        <Section title="By class · this month" flush>
          {/* Mobile: stacked rows (a 3-col table is too tight on a phone). */}
          <ul className="divide-y divide-slate-100 sm:hidden">
            {classRows.map((c) => (
              <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate font-medium text-slate-900">{c.name}</div>
                  <div className="text-xs text-slate-500">{c.lessons} lesson{c.lessons === 1 ? "" : "s"}</div>
                </div>
                <div className="shrink-0 font-semibold tabular-nums text-slate-900">{money(c.pay)}</div>
              </li>
            ))}
            <li className="flex items-center justify-between gap-3 border-t-2 border-slate-200 bg-slate-50 px-4 py-3">
              <div className="font-semibold text-slate-900">Total · {thisSess.length} lesson{thisSess.length === 1 ? "" : "s"}</div>
              <div className="shrink-0 font-bold tabular-nums text-emerald-700">{money(thisPay)}</div>
            </li>
          </ul>
          {/* Desktop: full table. */}
          <div className="hidden sm:block">
            <Table>
              <thead>
                <tr><Th>Class</Th><Th className="text-right">Lessons</Th><Th className="text-right">Pay</Th></tr>
              </thead>
              <tbody>
                {classRows.map((c) => (
                  <tr key={c.name} className="hover:bg-slate-50">
                    <Td className="font-medium text-slate-900">{c.name}</Td>
                    <Td className="text-right tabular-nums">{c.lessons}</Td>
                    <Td className="text-right font-semibold tabular-nums text-slate-900">{money(c.pay)}</Td>
                  </tr>
                ))}
                <tr className="border-t-2 border-slate-200 bg-slate-50">
                  <Td className="font-semibold text-slate-900">Total</Td>
                  <Td className="text-right font-semibold tabular-nums">{thisSess.length}</Td>
                  <Td className="text-right font-bold tabular-nums text-emerald-700">{money(thisPay)}</Td>
                </tr>
              </tbody>
            </Table>
          </div>
        </Section>
      ) : (
        <EmptyState
          message={classIds.length === 0 ? "You're not assigned to any classes yet." : "No lessons recorded this month yet."}
        />
      )}

      <p className="text-xs text-slate-400">
        Pay = lessons taught × your per-lesson rate. The academy sets your rate; contact admin if it looks wrong.
      </p>
    </div>
  );
}
