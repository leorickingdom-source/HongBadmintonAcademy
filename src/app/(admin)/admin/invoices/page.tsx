import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, Table, Th, Td, Badge, EmptyState, Button } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import type { InvoiceStatus } from "@/lib/types";
import { markPaid, deleteInvoice, sendReminder } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<InvoiceStatus, "green" | "yellow" | "red" | "slate"> = {
  draft: "slate", unpaid: "yellow", paid: "green", overdue: "red",
  canceled: "slate", refunded: "slate",
};

export default async function InvoicesPage() {
  const supabase = await createClient();

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name)")
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("*, invoices(invoice_no)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="space-y-10">
      <div>
        <PageHeader
          title="Invoices & Payments"
          description="Raise fees, reconcile payments, send WhatsApp reminders."
          action={<LinkButton href="/admin/invoices/new">+ New invoice</LinkButton>}
        />

        {invoices && invoices.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Invoice</Th><Th>Student</Th><Th>Parent</Th><Th>Amount</Th>
                <Th>Due</Th><Th>Status</Th><Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i: any) => (
                <tr key={i.id}>
                  <Td className="font-mono text-xs">{i.invoice_no ?? "—"}</Td>
                  <Td className="font-medium text-slate-900">{i.students?.full_name ?? "—"}</Td>
                  <Td>{i.parent?.full_name ?? "—"}</Td>
                  <Td>{formatCurrency(Number(i.amount), i.currency)}</Td>
                  <Td>{formatDate(i.due_date)}</Td>
                  <Td><Badge tone={TONE[i.status as InvoiceStatus]}>{i.status}</Badge></Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      {i.status !== "paid" && (
                        <form action={markPaid}>
                          <input type="hidden" name="id" value={i.id} />
                          <Button type="submit" variant="secondary">Mark paid</Button>
                        </form>
                      )}
                      <form action={sendReminder}>
                        <input type="hidden" name="id" value={i.id} />
                        <Button type="submit" variant="secondary">Remind</Button>
                      </form>
                      <form action={deleteInvoice}>
                        <input type="hidden" name="id" value={i.id} />
                        <ConfirmButton confirmText="Delete this invoice?" />
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState message="No invoices yet." />
        )}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Recent payments</h2>
        {payments && payments.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th><Th>Invoice</Th><Th>Amount</Th><Th>Provider</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id}>
                  <Td>{formatDateTime(p.created_at)}</Td>
                  <Td className="font-mono text-xs">{p.invoices?.invoice_no ?? "—"}</Td>
                  <Td>{formatCurrency(Number(p.amount), p.currency)}</Td>
                  <Td>{p.provider}</Td>
                  <Td>
                    <Badge tone={p.status === "succeeded" ? "green" : p.status === "failed" ? "red" : "slate"}>
                      {p.status}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState message="No payments recorded yet." />
        )}
      </div>
    </div>
  );
}
