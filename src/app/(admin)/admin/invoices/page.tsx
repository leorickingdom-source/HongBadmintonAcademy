import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";
import { waLink } from "@/lib/wa";
import type { InvoiceStatus } from "@/lib/types";
import { markPaid, deleteInvoice, logReminderSend, sendReminder } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<InvoiceStatus, "green" | "yellow" | "red" | "slate"> = {
  draft: "slate", unpaid: "yellow", paid: "green", overdue: "red",
  canceled: "slate", refunded: "slate",
};

export default async function InvoicesPage() {
  const supabase = await createClient();
  const baseUrl = await getBaseUrl();

  const [{ data: invoices }, { data: payments }] = await Promise.all([
    supabase
      .from("invoices")
      .select("*, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name, phone, id)")
      .order("created_at", { ascending: false }),
    supabase
      .from("payments")
      .select("*, invoices(invoice_no)")
      .order("created_at", { ascending: false })
      .limit(10),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Invoices & Payments"
          description="Raise fees, reconcile payments, send WhatsApp reminders (click-to-chat)."
          action={<LinkButton href="/admin/invoices/new">+ New invoice</LinkButton>}
        />

        {invoices && invoices.length > 0 ? (
          <Section title={`Invoices (${invoices.length})`} flush>
            <Table>
              <thead>
                <tr>
                  <Th>Invoice</Th><Th>Student</Th><Th>Parent</Th><Th>Amount</Th>
                  <Th>Due</Th><Th>Status</Th><Th className="text-right">Actions</Th>
                </tr>
              </thead>
              <tbody>
                {invoices.map((i: any) => {
                  const payable = i.status !== "paid" && i.status !== "canceled" && i.status !== "refunded";
                  const text =
                    `Hi ${i.parent?.full_name ?? "Parent"}, the fee of ` +
                    `${formatCurrency(Number(i.amount), i.currency)} for ${i.students?.full_name ?? "your child"} ` +
                    `is due ${formatDate(i.due_date)}. Pay here: ${baseUrl}/parent/invoices`;
                  const waUrl = waLink(i.parent?.phone, text);
                  return (
                    <tr key={i.id} className="hover:bg-slate-50">
                      <Td className="font-mono text-xs text-slate-500">{i.invoice_no ?? "—"}</Td>
                      <Td label="Student" className="font-medium text-slate-900">{i.students?.full_name ?? "—"}</Td>
                      <Td label="Parent" className="text-slate-500">{i.parent?.full_name ?? "—"}</Td>
                      <Td label="Amount" className="font-medium text-slate-900">{formatCurrency(Number(i.amount), i.currency)}</Td>
                      <Td label="Due" className="text-slate-500">{formatDate(i.due_date)}</Td>
                      <Td label="Status"><Badge tone={TONE[i.status as InvoiceStatus]}>{i.status}</Badge></Td>
                      <Td className="text-right">
                        <div className="flex justify-end gap-2">
                          {i.status !== "paid" && (
                            <form action={markPaid}>
                              <input type="hidden" name="id" value={i.id} />
                              <SubmitButton variant="secondary" pendingText="Saving…">Mark paid</SubmitButton>
                            </form>
                          )}
                          {payable && (
                            <WhatsAppButton
                              waUrl={waUrl}
                              action={logReminderSend}
                              label="Remind"
                              fields={{
                                invoice_id: i.id,
                                recipient_phone: i.parent?.phone ?? "",
                                recipient_profile_id: i.parent?.id ?? "",
                                body: text,
                              }}
                            />
                          )}
                          {payable && i.parent?.phone && (
                            <form action={sendReminder}>
                              <input type="hidden" name="id" value={i.id} />
                              <SubmitButton variant="secondary" pendingText="Sending…">Remind (bot)</SubmitButton>
                            </form>
                          )}
                          <form action={deleteInvoice}>
                            <input type="hidden" name="id" value={i.id} />
                            <ConfirmButton confirmText="Delete this invoice?" />
                          </form>
                        </div>
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          </Section>
        ) : (
          <EmptyState message="No invoices yet." />
        )}
      </div>

      <Section title="Recent payments" flush>
        {payments && payments.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Date</Th><Th>Invoice</Th><Th>Amount</Th><Th>Provider</Th><Th>Status</Th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="text-slate-500">{formatDateTime(p.created_at)}</Td>
                  <Td className="font-mono text-xs text-slate-500">{p.invoices?.invoice_no ?? "—"}</Td>
                  <Td className="font-medium text-slate-900">{formatCurrency(Number(p.amount), p.currency)}</Td>
                  <Td className="capitalize text-slate-500">{p.provider}</Td>
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
          <div className="p-5"><EmptyState message="No payments recorded yet." /></div>
        )}
      </Section>
    </div>
  );
}
