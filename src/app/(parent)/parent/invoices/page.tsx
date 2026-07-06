import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { PageHeader, Badge, EmptyState, cn } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatCurrency, formatDate } from "@/lib/format";
import type { InvoiceStatus } from "@/lib/types";
import { payInvoice } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<InvoiceStatus, "green" | "yellow" | "red" | "slate"> = {
  draft: "slate", unpaid: "yellow", paid: "green", overdue: "red",
  canceled: "slate", refunded: "slate",
};
const PAYABLE = new Set(["unpaid", "overdue"]);

export default async function ParentInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; error?: string }>;
}) {
  const me = await requireParent();
  const { paid, error } = await searchParams;
  const supabase = createAdminClient();

  const [{ data: invoices }, { data: kids }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, students(full_name)")
      .eq("parent_id", me.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("students")
      .select("full_name, fee_plans(amount, currency, interval)")
      .eq("parent_id", me.id)
      .order("full_name"),
  ]);

  // Each child's recurring plan, shown next to their name (no separate box).
  const planByChild = new Map<string, string>();
  for (const k of (kids ?? []) as any[]) {
    if (k.fee_plans) {
      planByChild.set(
        k.full_name,
        `${formatCurrency(Number(k.fee_plans.amount), k.fee_plans.currency)}${k.fee_plans.interval === "monthly" ? "/mo" : ""}`,
      );
    }
  }

  // Only what's owed up front; paid/past invoices fold into a collapsible.
  const payable = (invoices ?? []).filter((i: any) => PAYABLE.has(i.status));
  const history = (invoices ?? []).filter((i: any) => !PAYABLE.has(i.status));

  const byChild = new Map<string, any[]>();
  for (const inv of payable as any[]) {
    const name = inv.students?.full_name ?? "Other";
    const arr = byChild.get(name) ?? [];
    arr.push(inv);
    byChild.set(name, arr);
  }
  const invoiceGroups = [...byChild.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  // Invoices never auto-flip to "overdue" — detect past-due from the date.
  const todayStr = new Date().toLocaleDateString("en-CA");
  const isPastDue = (i: any) => (i.status === "unpaid" || i.status === "overdue") && i.due_date && i.due_date < todayStr;

  return (
    <div>
      <PageHeader title="Fees & Payments" />

      {paid && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Payment received — thank you!
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {invoiceGroups.length > 0 ? (
        <div className="space-y-5">
          {invoiceGroups.map(([name, list]) => (
            <div key={name}>
              <h2 className="mb-2 flex items-baseline gap-2 text-sm font-semibold text-slate-700">
                {name}
                {planByChild.get(name) && (
                  <span className="text-xs font-normal text-slate-400">· {planByChild.get(name)}</span>
                )}
              </h2>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {list.map((i: any) => (
                  <li
                    key={i.id}
                    className={cn(
                      "flex items-center justify-between gap-3 px-4 py-3.5",
                      isPastDue(i) && "bg-red-50",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{formatCurrency(Number(i.amount), i.currency)}</div>
                      <div className="truncate text-sm text-slate-500">
                        {i.description || "Fee"}{i.due_date ? ` · due ${formatDate(i.due_date)}` : ""}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={isPastDue(i) ? "red" : TONE[i.status as InvoiceStatus]}>{isPastDue(i) ? "overdue" : i.status}</Badge>
                      <a href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener" className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50">PDF</a>
                      <form action={payInvoice}>
                        <input type="hidden" name="id" value={i.id} />
                        <SubmitButton pendingText="…" className="!px-3 !py-1.5">Pay</SubmitButton>
                      </form>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm font-medium text-slate-600">
          {history.length > 0 ? "You're all paid up — thank you!" : "No invoices yet."}
        </div>
      )}

      {history.length > 0 && (
        <details className="group mt-6">
          <summary className="flex cursor-pointer list-none items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-700">
            <span className="transition-transform group-open:rotate-90">▸</span> Paid &amp; past invoices ({history.length})
          </summary>
          <ul className="mt-3 divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
            {history.map((i: any) => (
              <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <div className="font-medium text-slate-700">{formatCurrency(Number(i.amount), i.currency)}</div>
                  <div className="truncate text-xs text-slate-400">
                    {i.students?.full_name ?? "Fee"}{i.due_date ? ` · ${formatDate(i.due_date)}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <Badge tone={TONE[i.status as InvoiceStatus]}>{i.status}</Badge>
                  <a href={`/api/invoices/${i.id}/pdf`} target="_blank" rel="noopener" className="text-xs font-medium text-emerald-700 hover:underline">PDF</a>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
