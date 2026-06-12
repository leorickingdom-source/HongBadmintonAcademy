import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Card, EmptyState } from "@/components/ui";
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

  // Lessons across this + last month for the coach's classes.
  const { data: sess } = classIds.length
    ? await supabase
        .from("sessions")
        .select("id, session_date")
        .in("class_id", classIds)
        .gte("session_date", lm.start)
        .lte("session_date", tm.end)
    : { data: [] as any[] };

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

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Payroll"
        description={`Auto-calculated from lessons taught · rate set by the academy · ${tm.label}`}
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Pay rate" value={formatCurrency(rate, undefined, { whole: true })} sub="per lesson" />
        <StatCard label="Lessons" value={thisSess.length} sub={tm.label} />
        <StatCard label="This month's pay" value={formatCurrency(thisPay, undefined, { whole: true })} tone="green" sub="auto-calculated" />
        <StatCard
          label="Attendance"
          value={attPct != null ? `${attPct}%` : "—"}
          tone={attPct != null && attPct >= 70 ? "green" : "amber"}
          sub="your classes"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">This month</div>
          <div className="mt-1 text-sm text-slate-700">{tm.label}</div>
          <div className="mt-2 text-sm text-slate-700">
            {thisSess.length} lessons × {formatCurrency(rate, undefined, { whole: true })}
          </div>
          <div className="mt-1 text-2xl font-bold text-green-700">{formatCurrency(thisPay, undefined, { whole: true })}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Previous month</div>
          <div className="mt-1 text-sm text-slate-700">{lm.label}</div>
          <div className="mt-2 text-sm text-slate-700">
            {lastSess.length} lessons × {formatCurrency(rate, undefined, { whole: true })}
          </div>
          <div className="mt-1 text-2xl font-bold text-slate-700">{formatCurrency(lastPay, undefined, { whole: true })}</div>
        </Card>
      </div>

      {classIds.length === 0 && (
        <EmptyState message="You're not assigned to any classes yet, so there's nothing to calculate." />
      )}

      <p className="text-xs text-slate-400">
        Pay = lessons taught × your per-lesson rate. The academy sets your rate; contact admin if it looks wrong.
      </p>
    </div>
  );
}
