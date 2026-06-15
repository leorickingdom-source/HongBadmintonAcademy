import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { monthLabel } from "@/lib/format";

// First calendar day (YYYY-MM-DD) of the month containing `d`.
function monthStart(d: Date): string {
  return new Date(d.getFullYear(), d.getMonth(), 1).toLocaleDateString("en-CA");
}

// Day-of-month the auto-raised fee falls due (kept simple/constant for now).
const DUE_DAY = 7;

// Raise the monthly fee invoice for every active student that has a *monthly*
// fee plan assigned. Idempotent: the (student_id, period_month, fee_plan_id)
// unique index + upsert ignore means re-runs (or the manual force button) never
// double-bill. Mirrors generateScorecardsCore.
//
// `db`    — RLS client (manual admin path) or service-role client (headless cron).
// `month` — any date within the month to bill (defaults to the current month).
export async function generateInvoicesCore(
  db: SupabaseClient,
  month: Date = new Date(),
): Promise<{ eligible: number; generated: number }> {
  const period = monthStart(month);
  const dueDate = new Date(month.getFullYear(), month.getMonth(), DUE_DAY).toLocaleDateString("en-CA");
  const label = monthLabel(period);

  const { data: students, error } = await db
    .from("students")
    .select(
      "id, parent_id, fee_plan_id, fee_plan:fee_plans!students_fee_plan_id_fkey(amount, currency, interval, is_active)",
    )
    .eq("status", "active")
    .not("fee_plan_id", "is", null);
  if (error) throw new Error(error.message);

  const rows: Array<Record<string, unknown>> = [];
  for (const s of students ?? []) {
    const plan = (s as any).fee_plan;
    if (!plan || !plan.is_active || plan.interval !== "monthly") continue;
    rows.push({
      student_id: s.id,
      parent_id: (s as any).parent_id,
      fee_plan_id: (s as any).fee_plan_id,
      amount: plan.amount,
      currency: plan.currency,
      period_month: period,
      due_date: dueDate,
      description: `Monthly fee — ${label}`,
      status: "unpaid",
    });
  }

  if (rows.length === 0) return { eligible: 0, generated: 0 };

  // ON CONFLICT DO NOTHING via ignoreDuplicates; .select() returns only the rows
  // actually inserted, so its length is the real count of new invoices.
  const { data: inserted, error: upErr } = await db
    .from("invoices")
    .upsert(rows, { onConflict: "student_id,period_month,fee_plan_id", ignoreDuplicates: true })
    .select("id");
  if (upErr) throw new Error(upErr.message);

  return { eligible: rows.length, generated: inserted?.length ?? 0 };
}
