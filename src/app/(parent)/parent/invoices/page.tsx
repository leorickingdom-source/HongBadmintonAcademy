import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { Banknote } from "lucide-react";
import { PageHeader, Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { env } from "@/lib/env";
import { waLink } from "@/lib/wa";
import type { InvoiceStatus } from "@/lib/types";
import { payInvoice } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<InvoiceStatus, "green" | "yellow" | "red" | "slate"> = {
  draft: "slate", unpaid: "yellow", paid: "green", overdue: "red",
  canceled: "slate", refunded: "slate",
};

export default async function ParentInvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ paid?: string; error?: string }>;
}) {
  const me = await requireParent();
  const { paid, error } = await searchParams;
  const supabase = createAdminClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, students(full_name)")
    .eq("parent_id", me.id)
    .order("created_at", { ascending: false });

  const { data: kids } = await supabase
    .from("students")
    .select("full_name, fee_plans(name, amount, currency, interval)")
    .eq("parent_id", me.id)
    .order("full_name");

  // Group invoices under each child so a parent isn't cross-referencing names.
  const byChild = new Map<string, any[]>();
  for (const inv of (invoices ?? []) as any[]) {
    const name = inv.students?.full_name ?? "Other";
    const arr = byChild.get(name) ?? [];
    arr.push(inv);
    byChild.set(name, arr);
  }
  const invoiceGroups = [...byChild.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  return (
    <div>
      <PageHeader title="Fees & Payments" />

      {kids && kids.some((k: any) => k.fee_plans) && (
        <div className="mb-4 overflow-hidden rounded-xl border border-slate-200 bg-white">
          {kids.filter((k: any) => k.fee_plans).map((k: any, i: number) => (
            <div key={i} className="flex items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm first:border-t-0">
              <span className="font-medium text-slate-900">{k.full_name}</span>
              <span className="text-slate-600">{k.fee_plans.name} · {formatCurrency(Number(k.fee_plans.amount), k.fee_plans.currency)}{k.fee_plans.interval === "monthly" ? "/mo" : ""}</span>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex items-start gap-2.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        <Banknote className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <p>
          Paid by cash or transfer?{" "}
          {env.academyWhatsapp ? (
            <a
              href={waLink(env.academyWhatsapp, "Hi, here is my payment receipt for invoice ") ?? "#"}
              target="_blank"
              rel="noopener"
              className="font-medium text-green-700 hover:underline"
            >
              Send your receipt on WhatsApp
            </a>
          ) : (
            <span className="font-medium text-slate-700">Send your receipt on WhatsApp</span>
          )}{" "}
          and we&apos;ll mark it paid.
        </p>
      </div>

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
              <h2 className="mb-2 text-sm font-semibold text-slate-700">{name}</h2>
              <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
                {list.map((i: any) => (
                  <li key={i.id} className="flex items-center justify-between gap-3 px-4 py-3.5">
                    <div className="min-w-0">
                      <div className="font-semibold text-slate-900">{formatCurrency(Number(i.amount), i.currency)}</div>
                      <div className="truncate text-sm text-slate-500">
                        {i.description || "Fee"} · due {formatDate(i.due_date)}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={TONE[i.status as InvoiceStatus]}>{i.status}</Badge>
                      {i.status !== "paid" && i.status !== "canceled" && i.status !== "refunded" && (
                        <form action={payInvoice}>
                          <input type="hidden" name="id" value={i.id} />
                          <SubmitButton pendingText="…" className="!px-3 !py-1.5">Pay</SubmitButton>
                        </form>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <EmptyState message="No invoices yet." />
      )}
    </div>
  );
}
