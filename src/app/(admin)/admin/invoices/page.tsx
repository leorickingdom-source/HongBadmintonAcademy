import { createClient } from "@/lib/supabase/server";
import { PageHeader, Collapsible, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { FilterSelect, FilterSearch } from "@/components/filter-controls";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { formatCurrency, formatDate, formatDateTime, monthLabel } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";
import { getMonthlySchedule } from "@/lib/settings";
import { waLink } from "@/lib/wa";
import { feeReminderText } from "@/lib/reminder-text";
import type { InvoiceStatus } from "@/lib/types";
import { markPaid, deleteInvoice, logReminderSend, generateMonthlyInvoices } from "./actions";

export const dynamic = "force-dynamic";

const TONE: Record<InvoiceStatus, "green" | "yellow" | "red" | "slate"> = {
  draft: "slate", unpaid: "yellow", paid: "green", overdue: "red",
  canceled: "slate", refunded: "slate",
};

const STATUSES: InvoiceStatus[] = ["draft", "unpaid", "paid", "overdue", "canceled", "refunded"];

// Ordinal suffix for "due on the 7th" copy.
function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<{ generated?: string; notice?: string; status?: string; month?: string; q?: string }>;
}) {
  const { generated, notice, status, month, q } = await searchParams;
  const supabase = await createClient();
  const baseUrl = await getBaseUrl();
  const schedule = await getMonthlySchedule();

  const statusFilter = status && (STATUSES as string[]).includes(status) ? status : "";
  const monthFilter = month && /^\d{4}-\d{2}-\d{2}$/.test(month) ? month : "";
  const search = (q ?? "").trim().toLowerCase();

  let invQuery = supabase
    .from("invoices")
    .select("*, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name, phone, id)")
    .order("created_at", { ascending: false });
  if (statusFilter) invQuery = invQuery.eq("status", statusFilter);
  if (monthFilter) invQuery = invQuery.eq("period_month", monthFilter);

  const [{ data: rawInvoices }, { data: payments }, { data: monthRows }] = await Promise.all([
    invQuery,
    supabase
      .from("payments")
      .select("*, invoices(invoice_no)")
      .order("created_at", { ascending: false })
      .limit(10),
    supabase.from("invoices").select("period_month").not("period_month", "is", null),
  ]);

  // Distinct billing months for the dropdown (newest first).
  const monthOptions = [...new Set((monthRows ?? []).map((r: any) => r.period_month as string))].sort().reverse();

  // Name search is applied in-memory (Supabase can't ILIKE across embedded relations).
  const invoices = search
    ? (rawInvoices ?? []).filter((i: any) =>
        `${i.students?.full_name ?? ""} ${i.parent?.full_name ?? ""}`.toLowerCase().includes(search),
      )
    : rawInvoices ?? [];

  const filtered = Boolean(statusFilter || monthFilter || search);

  return (
    <div className="space-y-8">
      <div>
        <PageHeader
          title="Invoices & Payments"
          description={`Monthly fees auto-raise for students on a fee plan. Every fee falls due on the ${ordinal(schedule.dueDay)} of the month (Settings → Monthly schedule). Reconcile payments; reminders drip-send automatically.`}
          action={
            <>
              <form action={generateMonthlyInvoices}>
                <SubmitButton variant="secondary" pendingText="Generating…">Generate this month</SubmitButton>
              </form>
              <LinkButton href="/admin/invoices/new">+ New invoice</LinkButton>
            </>
          }
        />

        {generated !== undefined && (() => {
          const n = Number(generated);
          const map: Record<string, { tone: string; msg: string }> = {
            queued: { tone: "border-green-200 bg-green-50 text-green-800", msg: "Community notice queued — worker will post the combined update to parents shortly." },
            updated: { tone: "border-green-200 bg-green-50 text-green-800", msg: "Combined Community notice (reports + fees) refreshed and queued." },
            "already-sent": { tone: "border-blue-200 bg-blue-50 text-blue-800", msg: "This month's Community notice was already posted — not duplicated." },
            skipped: { tone: "border-slate-200 bg-slate-50 text-slate-700", msg: "" },
            "no-group-id": { tone: "border-amber-200 bg-amber-50 text-amber-800", msg: "⚠️ Set WA_COMMUNITY_GROUP_ID in Vercel to auto-post the Community notice." },
          };
          const m = map[notice ?? ""] ?? { tone: "border-slate-200 bg-slate-50 text-slate-700", msg: "" };
          return (
            <div className={`mb-5 rounded-xl border p-4 text-sm ${m.tone}`}>
              <strong>Raised {n} invoice{n === 1 ? "" : "s"} for this month.</strong> {m.msg}
            </div>
          );
        })()}

        {/* Filters (auto-apply) */}
        <form method="get" className="mb-4 flex flex-wrap items-end gap-3">
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Status</span>
            <FilterSelect name="status" defaultValue={statusFilter} className="h-9 w-40">
              <option value="">All statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </FilterSelect>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Month</span>
            <FilterSelect name="month" defaultValue={monthFilter} className="h-9 w-44">
              <option value="">All months</option>
              {monthOptions.map((mo) => (
                <option key={mo} value={mo}>{monthLabel(mo)}</option>
              ))}
            </FilterSelect>
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-medium text-slate-600">Student / parent</span>
            <FilterSearch name="q" defaultValue={q ?? ""} placeholder="Search name…" className="h-9 w-52" />
          </label>
          {filtered && (
            <LinkButton href="/admin/invoices" variant="ghost">Clear</LinkButton>
          )}
        </form>

        {invoices && invoices.length > 0 ? (
          <Collapsible title={filtered ? "Invoices (filtered)" : "Invoices"} count={invoices.length}>
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
                  const text = feeReminderText({
                    parentName: i.parent?.full_name,
                    studentName: i.students?.full_name,
                    amount: i.amount,
                    currency: i.currency,
                    dueDate: i.due_date,
                    payUrl: `${baseUrl}/parent/invoices`,
                  });
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
          </Collapsible>
        ) : (
          <EmptyState message={filtered ? "No invoices match these filters." : "No invoices yet."} />
        )}
      </div>

      <Collapsible title="Recent payments" count={payments?.length ?? 0}>
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
      </Collapsible>
    </div>
  );
}
