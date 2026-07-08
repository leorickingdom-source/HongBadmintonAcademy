"use client";

import { useMemo, useState, useTransition } from "react";
import { Calculator, Check, FileText } from "lucide-react";
import { createQuoteInvoice } from "@/app/(admin)/admin/calculator/actions";

type Plan = {
  id: string;
  name: string;
  amount: number;
  currency: string;
  interval: string;
  price_unit: string; // month | week | session | once
  sessions_per_week: number | null;
  sibling_discount_pct: number;
};
type StudentOpt = { id: string; full_name: string };

const WEEKS_PER_MONTH = 52 / 12; // ≈ 4.345
const UNIT_SUFFIX: Record<string, string> = { month: "/mo", week: "/wk", session: "/session", once: " one-off" };

// Fee estimator: pick a plan, family size and term; it applies the plan's
// per-session/weekly/monthly pricing, sibling discount and (optional) session-
// based proration for a mid-month start — then can raise a real invoice.
export function FeeCalculator({ plans, students }: { plans: Plan[]; students: StudentOpt[] }) {
  const [planId, setPlanId] = useState(plans[0]?.id ?? "");
  const plan = plans.find((p) => p.id === planId) ?? null;

  const [children, setChildren] = useState(1);
  const [months, setMonths] = useState(1);
  const [siblingPct, setSiblingPct] = useState<number>(plan?.sibling_discount_pct ?? 0);
  const [joiningFee, setJoiningFee] = useState(0);
  const [prorate, setProrate] = useState(false);
  const [startDate, setStartDate] = useState<string>(new Date().toISOString().slice(0, 10));

  // Keep the sibling % in sync when the plan changes (plan value is the default).
  const [lastPlan, setLastPlan] = useState(planId);
  if (planId !== lastPlan) {
    setLastPlan(planId);
    setSiblingPct(plan?.sibling_discount_pct ?? 0);
  }

  const currency = plan?.currency ?? "MYR";
  const fmt = (n: number) => new Intl.NumberFormat("en-MY", { style: "currency", currency }).format(Number.isFinite(n) ? n : 0);

  const calc = useMemo(() => {
    if (!plan) return null;
    const amount = Number(plan.amount) || 0;
    const unit = plan.price_unit || "month";
    const spw = Number(plan.sessions_per_week) || 0;
    const sessionsPerMonth = spw * WEEKS_PER_MONTH;

    // Monthly-equivalent price per child (for recurring units).
    let monthlyEquiv = amount;
    if (unit === "week") monthlyEquiv = amount * WEEKS_PER_MONTH;
    else if (unit === "session") monthlyEquiv = amount * sessionsPerMonth;
    const isOnce = unit === "once";

    // Session-based proration of the first month for a mid-month start. Falls
    // back to a calendar-day fraction when sessions/week is unknown.
    const d = new Date(`${startDate}T00:00:00`);
    let firstFactor = 1;
    if (prorate && !isOnce && !Number.isNaN(d.getTime())) {
      const daysInMonth = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const remainingDays = daysInMonth - d.getDate() + 1;
      if (sessionsPerMonth > 0) {
        const remainingSessions = Math.max(0, Math.round(sessionsPerMonth * (remainingDays / daysInMonth)));
        firstFactor = remainingSessions / sessionsPerMonth;
      } else {
        firstFactor = remainingDays / daysInMonth;
      }
    }

    const monthsFactor = isOnce ? 1 : prorate ? (months - 1) + firstFactor : months;
    const perChild = isOnce ? amount : monthlyEquiv * monthsFactor;

    const gross = perChild * children;
    // Sibling discount: applies to the 2nd+ child's recurring/one-off charge.
    const sibDisc = perChild * Math.max(0, children - 1) * (Math.min(100, Math.max(0, siblingPct)) / 100);
    const joining = joiningFee * children;
    const net = gross - sibDisc + joining;
    const perMonth = isOnce ? 0 : (monthlyEquiv * children - monthlyEquiv * Math.max(0, children - 1) * (siblingPct / 100));

    return { amount, unit, monthlyEquiv, isOnce, firstFactor, perChild, gross, sibDisc, joining, net, perMonth, sessionsPerMonth };
  }, [plan, children, months, siblingPct, joiningFee, prorate, startDate]);

  // ── Quote → invoice ──────────────────────────────────────────────────────
  const [studentId, setStudentId] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [saved, setSaved] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const invoiceAmount = calc ? Math.round(calc.net * 100) / 100 : 0;

  function createInvoice() {
    if (!plan || !studentId || invoiceAmount <= 0) return;
    setSaved(false);
    setMsg(null);
    const desc = `${plan.name}${calc && !calc.isOnce ? ` × ${months} mo` : ""}${children > 1 ? ` × ${children}` : ""}`;
    start(async () => {
      const r = await createQuoteInvoice({ student_id: studentId, amount: invoiceAmount, description: desc, due_date: dueDate || null, currency });
      if (r.ok) setSaved(true);
      else setMsg(r.error ?? "Could not create invoice.");
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {/* ── Inputs ─────────────────────────────────────────────────────────── */}
      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-5">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-slate-600">Fee plan</span>
          <select
            value={planId}
            onChange={(e) => setPlanId(e.target.value)}
            className="h-9 w-full rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none"
          >
            {plans.length === 0 && <option value="">No active fee plans</option>}
            {plans.map((p) => (
              <option key={p.id} value={p.id}>{p.name} — {fmt(Number(p.amount))}{UNIT_SUFFIX[p.price_unit] ?? ""}</option>
            ))}
          </select>
        </label>

        {plan && (
          <p className="text-xs text-slate-400">
            {fmt(Number(plan.amount))} per {plan.price_unit === "once" ? "one-off" : plan.price_unit}
            {plan.sessions_per_week ? ` · ${plan.sessions_per_week} session${plan.sessions_per_week > 1 ? "s" : ""}/week` : ""}
            {plan.sibling_discount_pct ? ` · ${plan.sibling_discount_pct}% sibling discount` : ""}
          </p>
        )}

        <div className="grid grid-cols-2 gap-3">
          <Num label="Children" value={children} set={setChildren} min={1} max={20} />
          {!calc?.isOnce && <Num label="Months" value={months} set={setMonths} min={1} max={36} />}
          <Num label="Sibling discount" value={siblingPct} set={setSiblingPct} min={0} max={100} suffix="%" />
          <Num label="Joining fee (each)" value={joiningFee} set={setJoiningFee} min={0} step={10} />
        </div>

        {!calc?.isOnce && (
          <div className="rounded-lg border border-slate-100 bg-slate-50 p-3">
            <label className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <input type="checkbox" checked={prorate} onChange={(e) => setProrate(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-green-600 focus:ring-green-500" />
              Prorate first month from a start date
            </label>
            {prorate && (
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="h-9 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none"
                />
                {calc && (
                  <span className="text-xs text-slate-500">
                    first month ≈ {Math.round(calc.firstFactor * 100)}%
                    {calc.sessionsPerMonth > 0 ? " (by sessions)" : " (by days)"}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Estimate + create invoice ──────────────────────────────────────── */}
      <div className="space-y-3 rounded-xl border-2 border-green-100 bg-green-50/50 p-5">
        <div className="flex items-center gap-2 text-green-700">
          <Calculator className="h-4 w-4" />
          <span className="text-sm font-semibold">Estimate</span>
        </div>

        {calc ? (
          <>
            <Row label={`${fmt(calc.perChild)} × ${children} child${children > 1 ? "ren" : ""}`} value={fmt(calc.gross)} />
            {calc.sibDisc > 0 && <Row label={`Sibling discount (${siblingPct}%)`} value={`− ${fmt(calc.sibDisc)}`} muted />}
            {calc.joining > 0 && <Row label={`Joining fee × ${children}`} value={fmt(calc.joining)} />}
            <div className="border-t border-green-200 pt-3">
              <div className="flex items-end justify-between">
                <span className="text-sm font-medium text-slate-600">Total estimate</span>
                <span className="text-3xl font-bold text-green-700">{fmt(calc.net)}</span>
              </div>
              {!calc.isOnce && <div className="mt-1 text-right text-xs text-slate-500">≈ {fmt(calc.perMonth)} / month</div>}
            </div>
          </>
        ) : (
          <p className="text-sm text-slate-500">Pick a fee plan to see an estimate.</p>
        )}

        {/* Quote → invoice */}
        <div className="mt-2 space-y-2 border-t border-green-200 pt-3">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
            <FileText className="h-3.5 w-3.5" /> Create invoice for a student
          </div>
          <select
            value={studentId}
            onChange={(e) => { setStudentId(e.target.value); setSaved(false); setMsg(null); }}
            className="h-9 w-full rounded-lg border border-slate-300 bg-white px-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none"
          >
            <option value="">Select a student…</option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>{s.full_name}</option>
            ))}
          </select>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              aria-label="Due date"
              className="h-9 flex-1 rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none"
            />
            <button
              type="button"
              onClick={createInvoice}
              disabled={pending || !studentId || invoiceAmount <= 0}
              className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg bg-green-600 px-3 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-40"
            >
              {saved ? <><Check className="h-4 w-4" /> Created</> : `Invoice ${fmt(invoiceAmount)}`}
            </button>
          </div>
          {msg && <p className="text-xs font-medium text-red-600">{msg}</p>}
          <p className="text-xs text-slate-400">Bills the selected student the total above as an unpaid invoice. For siblings, invoice each child.</p>
        </div>
      </div>
    </div>
  );
}

function Num({ label, value, set, min = 0, max, step = 1, suffix }: { label: string; value: number; set: (n: number) => void; min?: number; max?: number; step?: number; suffix?: string }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => set(Number(e.target.value))}
          className="h-9 w-full rounded-lg border border-slate-300 px-2.5 text-sm text-slate-900 focus:border-green-500 focus:outline-none"
        />
        {suffix && <span className="shrink-0 text-xs text-slate-400">{suffix}</span>}
      </div>
    </label>
  );
}

function Row({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-slate-600">{label}</span>
      <span className={muted ? "font-medium text-amber-700" : "font-medium text-slate-900"}>{value}</span>
    </div>
  );
}
