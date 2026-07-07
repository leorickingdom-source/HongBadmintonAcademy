import "server-only";
import { monthLabel } from "@/lib/format";
import { monthlyPayrollTotal } from "@/lib/payroll";

// Per-arm money split (Academy vs Club). One entity / one Stripe account — the
// split is the `business` tag written on invoices + payments (migration 0043).
// Revenue side = collected / billed / outstanding. Spend side = court cost +
// coach salaries → "available" (collected − spend). Court cost + salaries are
// academy-only for now (the club has no staff/court cost until court booking,
// slice #3, tags club court usage).

export type Arm = "academy" | "club";
export interface ArmTotals {
  collected: number; // succeeded payments dated in the month
  billed: number; // invoices for the month (excl. canceled/refunded)
  outstanding: number; // unpaid/overdue invoices (any month)
  courtCost: number; // court rental expense this month
  salaries: number; // coach pay this month
  available: number; // collected − courtCost − salaries ("in the pot to draw")
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
  const startYmd = mStart.toLocaleDateString("en-CA");
  const endYmd = mEnd.toLocaleDateString("en-CA");
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

  const [{ data: payments }, { data: invoices }, { data: rentals }, salaries] = await Promise.all([
    paymentsQ,
    B(supabase.from("invoices").select("amount, status, period_month, business")).limit(10000),
    // Court rental cost this month (super-admin RLS; academy expense for now).
    B(supabase.from("court_rentals").select("amount")).gte("rental_date", startYmd).lt("rental_date", endYmd),
    monthlyPayrollTotal(supabase, month, branchId),
  ]);

  const blank = (): ArmTotals => ({ collected: 0, billed: 0, outstanding: 0, courtCost: 0, salaries: 0, available: 0 });
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

  // Spend side — academy-only for now (see header note).
  arms.academy.courtCost = (rentals ?? []).reduce((s: number, r: any) => s + Number(r.amount), 0);
  arms.academy.salaries = Number(salaries) || 0;

  const round = (t: ArmTotals): ArmTotals => {
    const collected = Math.round(t.collected);
    const courtCost = Math.round(t.courtCost);
    const salaries = Math.round(t.salaries);
    return {
      collected,
      billed: Math.round(t.billed),
      outstanding: Math.round(t.outstanding),
      courtCost,
      salaries,
      available: collected - courtCost - salaries,
    };
  };
  const academy = round(arms.academy);
  const club = round(arms.club);
  const total: ArmTotals = {
    collected: academy.collected + club.collected,
    billed: academy.billed + club.billed,
    outstanding: academy.outstanding + club.outstanding,
    courtCost: academy.courtCost + club.courtCost,
    salaries: academy.salaries + club.salaries,
    available: academy.available + club.available,
  };
  return { monthLabel: monthLabel(mStart.toISOString()), academy, club, total };
}
