import { Banknote, Clock, CircleCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, StatCard, Section, Avatar, Badge, EmptyState, cn } from "@/components/ui";
import { WhatsAppButton } from "@/components/whatsapp-button";
import { computeAnalytics } from "@/lib/analytics";
import { formatCurrency, formatDate } from "@/lib/format";
import { getBaseUrl } from "@/lib/url";
import { waLink } from "@/lib/wa";
import { feeReminderText } from "@/lib/reminder-text";
import { logReminderSend } from "../invoices/actions";

export const dynamic = "force-dynamic";

const DAY = 24 * 60 * 60 * 1000;

export default async function CollectionsPage() {
  const supabase = await createClient();
  const baseUrl = await getBaseUrl();
  const today = new Date().toLocaleDateString("en-CA");

  const [a, { data: overdue }] = await Promise.all([
    computeAnalytics(supabase),
    supabase
      .from("invoices")
      .select("id, invoice_no, amount, currency, due_date, status, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name, phone, id)")
      .in("status", ["unpaid", "overdue"])
      .lt("due_date", today)
      .order("due_date", { ascending: true })
      .limit(100),
  ]);

  const rows = (overdue ?? []) as any[];
  const cur = a.currency;

  const buckets = [
    { label: "0–30 days", amount: a.feeAging.d0, bar: "bg-amber-200" },
    { label: "31–60 days", amount: a.feeAging.d30, bar: "bg-amber-500" },
    { label: "61–90 days", amount: a.feeAging.d60, bar: "bg-red-300" },
    { label: "90+ days", amount: a.feeAging.d90, bar: "bg-red-500" },
  ];
  const maxBucket = Math.max(1, ...buckets.map((b) => b.amount));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Collections"
        description="Outstanding fees, ageing, and one-tap chasing. Auto-reminders still run on schedule — this is for hands-on follow-up."
      />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard label="Outstanding" value={formatCurrency(a.outstanding, cur)} tone={a.outstanding > 0 ? "red" : "green"} icon={<Banknote className="h-4 w-4" />} />
        <StatCard label={`Collected · ${a.monthLabel}`} value={formatCurrency(a.collection.collected, cur)} tone="green" />
        <StatCard label="Collection rate" value={a.collection.rate != null ? `${a.collection.rate}%` : "—"} tone={(a.collection.rate ?? 0) >= 80 ? "green" : "amber"} />
        <StatCard label="Overdue accounts" value={rows.length} tone={rows.length ? "red" : "green"} icon={<Clock className="h-4 w-4" />} />
      </div>

      <Section title="Receivables ageing">
        <div className="space-y-3">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center gap-3 text-sm">
              <span className="w-24 shrink-0 text-slate-600">{b.label}</span>
              <div className="h-5 flex-1 overflow-hidden rounded-lg bg-slate-100">
                <div className={cn("h-5 rounded-lg", b.bar)} style={{ width: `${Math.max(b.amount > 0 ? 6 : 0, (b.amount / maxBucket) * 100)}%` }} />
              </div>
              <span className="w-24 shrink-0 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(b.amount, cur)}</span>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Overdue accounts" description="Oldest first" flush>
        {rows.length === 0 ? (
          <div className="p-5"><EmptyState icon={<CircleCheck className="h-5 w-5 text-green-500" />} message="All caught up" hint="No overdue accounts right now." /></div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((i) => {
              const days = i.due_date ? Math.floor((Date.parse(today) - Date.parse(i.due_date)) / DAY) : 0;
              const text = feeReminderText({
                parentName: i.parent?.full_name,
                studentName: i.students?.full_name,
                amount: i.amount,
                currency: i.currency,
                dueDate: i.due_date,
                payUrl: `${baseUrl}/parent/invoices`,
              });
              return (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                  <Avatar name={i.students?.full_name ?? "?"} size={40} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium text-slate-900">{i.students?.full_name ?? "—"}</div>
                    <div className="truncate text-xs text-slate-500">
                      {i.parent?.full_name ?? "No parent"} · <span className="font-mono">{i.invoice_no ?? "—"}</span>
                    </div>
                  </div>
                  <Badge tone={days >= 60 ? "red" : "yellow"}>{days} d overdue</Badge>
                  <span className="w-20 text-right font-semibold tabular-nums text-slate-900">{formatCurrency(Number(i.amount), i.currency)}</span>
                  <WhatsAppButton
                    waUrl={waLink(i.parent?.phone, text)}
                    action={logReminderSend}
                    label="Chase"
                    fields={{
                      invoice_id: i.id,
                      recipient_phone: i.parent?.phone ?? "",
                      recipient_profile_id: i.parent?.id ?? "",
                      body: text,
                    }}
                  />
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
