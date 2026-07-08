import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, EmptyState } from "@/components/ui";
import { FeeCalculator } from "@/components/fee-calculator";
import { dict } from "@/lib/i18n";

export const dynamic = "force-dynamic";

// Staff-facing fee estimator (quote a prospective parent). Fee plans are read
// via the RLS client — all authenticated staff may read active plans.
export default async function CalculatorPage() {
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const supabase = await createClient();
  const [{ data: plans }, { data: students }] = await Promise.all([
    supabase
      .from("fee_plans")
      .select("id, name, amount, currency, interval, price_unit, sessions_per_week, sibling_discount_pct")
      .eq("is_active", true)
      .order("amount"),
    supabase
      .from("students")
      .select("id, full_name")
      .eq("status", "active")
      .order("full_name")
      .limit(2000),
  ]);

  return (
    <div className="space-y-5">
      <PageHeader title={L.cal_title} description={L.cal_desc} />
      {plans && plans.length > 0 ? (
        <FeeCalculator plans={plans as any} students={(students ?? []) as any} locale={me.locale} />
      ) : (
        <EmptyState message={L.cal_empty} />
      )}
    </div>
  );
}
