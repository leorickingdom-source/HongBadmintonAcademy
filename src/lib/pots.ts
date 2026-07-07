import "server-only";
import { monthLabel } from "@/lib/format";

// Per-arm money split (Academy vs Club). One entity / one Stripe account — the
// split is the `business` tag written on invoices + payments (migration 0043).
// v1 covers the revenue side (collected / billed / outstanding). Expenses (court
// cost, salaries) aren't business-tagged yet, so the pot's spend side lands in a
// later slice — see CLUB-PLAN §3.

export type Arm = "academy" | "club";
export interface ArmTotals {
  collected: number; // succeeded payments dated in the month
  billed: number; // invoices for the month (excl. canceled/refunded)
  outstanding: number; // unpaid/overdue invoices (any month)
}
export interface Pots {
  monthLabel: string;
  academy: ArmTotals;
  club: ArmTotals;
  total: ArmTotals;
}

const armOf = (b: unknown): Arm => (b === "club" ? "club" : "academy");

export async function computePots(
  supabase: any,
  month: Date = new Date(),
  branchId: string | null = null,
): Promise<Pots> {
  const mStart = new Date(month.getFullYear(), month.getMonth(), 1);
  const mEnd = new Date(month.getFullYear(), month.getMonth() + 1, 1); // exclusive
  const monthKey = mStart.toISOString().slice(0, 7);
  const B = (q: any) => (branchId ? q.eq("branch_id", branchId) : q);

  const paymentsQ = branchId
    ? supabase
        .from("payments")
        .select("amount, business, invoices!inner(branch_id)")
        .eq("invoices.branch_id", branchId)
        .eq("status", "succeeded")
        .gte("created_at", mStart.toISOString())
        .lt("created_at", mEnd.toISOString())
        .limit(10000)
    : supabase
        .from("payments")
        .select("amount, business")
        .eq("status", "succeeded")
        .gte("created_at", mStart.toISOString())
        .lt("created_at", mEnd.toISOString())
        .limit(10000);

  const [{ data: payments }, { data: invoices }] = await Promise.all([
    paymentsQ,
    B(supabase.from("invoices").select("amount, status, period_month, business")).limit(10000),
  ]);

  const blank = (): ArmTotals => ({ collected: 0, billed: 0, outstanding: 0 });
  const arms: Record<Arm, ArmTotals> = { academy: blank(), club: blank() };

  for (const p of payments ?? []) arms[armOf(p.business)].collected += Number(p.amount);
  for (const i of invoices ?? []) {
    const a = arms[armOf(i.business)];
    if (i.status === "unpaid" || i.status === "overdue") a.outstanding += Number(i.amount);
    if (
      i.period_month &&
      String(i.period_month).startsWith(monthKey) &&
      i.status !== "canceled" &&
      i.status !== "refunded"
    ) {
      a.billed += Number(i.amount);
    }
  }

  const round = (t: ArmTotals): ArmTotals => ({
    collected: Math.round(t.collected),
    billed: Math.round(t.billed),
    outstanding: Math.round(t.outstanding),
  });
  const academy = round(arms.academy);
  const club = round(arms.club);
  const total: ArmTotals = {
    collected: academy.collected + club.collected,
    billed: academy.billed + club.billed,
    outstanding: academy.outstanding + club.outstanding,
  };
  return { monthLabel: monthLabel(mStart.toISOString()), academy, club, total };
}
