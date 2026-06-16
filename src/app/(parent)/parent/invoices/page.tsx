import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
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
  await requireRole("parent");
  const { paid, error } = await searchParams;
  const supabase = await createClient();

  const { data: invoices } = await supabase
    .from("invoices")
    .select("*, students(full_name)")
    .order("created_at", { ascending: false });

  return (
    <div>
      <PageHeader title="Fees & Payments" description="Pay online, or send your receipt on WhatsApp for cash/transfer." />

      <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
        💵 Paid by cash or bank transfer?{" "}
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
          <span className="font-medium text-slate-700">Send your payment receipt to us on WhatsApp</span>
        )}{" "}
        and we&apos;ll mark it paid.
      </div>

      {paid && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Payment received — thank you!
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {invoices && invoices.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Invoice</Th><Th>Student</Th><Th>Description</Th><Th>Amount</Th>
              <Th>Due</Th><Th>Status</Th><Th className="text-right">Action</Th>
            </tr>
          </thead>
          <tbody>
            {invoices.map((i: any) => (
              <tr key={i.id} className="hover:bg-slate-50">
                <Td className="font-mono text-xs text-slate-500">{i.invoice_no ?? "—"}</Td>
                <Td>{i.students?.full_name ?? "—"}</Td>
                <Td className="text-slate-500">{i.description ?? "—"}</Td>
                <Td className="font-medium text-slate-900">{formatCurrency(Number(i.amount), i.currency)}</Td>
                <Td className="text-slate-500">{formatDate(i.due_date)}</Td>
                <Td><Badge tone={TONE[i.status as InvoiceStatus]}>{i.status}</Badge></Td>
                <Td className="text-right">
                  {i.status !== "paid" ? (
                    <form action={payInvoice}>
                      <input type="hidden" name="id" value={i.id} />
                      <SubmitButton pendingText="Redirecting…" className="!px-3 !py-1.5">Pay now</SubmitButton>
                    </form>
                  ) : (
                    <span className="text-xs font-medium text-green-600">Paid</span>
                  )}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState message="No invoices yet." />
      )}
    </div>
  );
}
