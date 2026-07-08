import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate, formatCurrency } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { cancelBooking } from "../actions";

export const dynamic = "force-dynamic";

const hhmm = (t: string) => (t ? String(t).slice(0, 5) : "");

export default async function CourtBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; error?: string }>;
}) {
  const me = await requireSuperAdmin();
  const L = dict(me.locale);
  const bkStatus: Record<string, string> = {
    confirmed: L.cb_st_confirmed, canceled: L.cb_st_canceled, pending: L.cb_st_pending,
  };
  const { canceled, error } = await searchParams;
  const supabase = await createClient();
  const { data: bookings } = await supabase
    .from("court_bookings")
    .select("id, booking_date, start_time, end_time, amount, currency, status, court:courts(name), member:club_members(full_name)")
    .order("booking_date", { ascending: false })
    .limit(200);

  const rows = bookings ?? [];

  return (
    <div>
      <PageHeader
        title={L.club_bookings}
        description={L.cb_desc}
        action={<LinkButton href="/admin/club" variant="secondary">{L.cb_back}</LinkButton>}
      />

      {canceled && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">{L.cb_canceled}</p>}
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {rows.length > 0 ? (
        <Section title={`${L.cb_section} (${rows.length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>{L.col_date}</Th>
                <Th>{L.cr_court}</Th>
                <Th>{L.cb_member}</Th>
                <Th>{L.col_time}</Th>
                <Th>{L.fp_amount}</Th>
                <Th>{L.col_status}</Th>
                <Th className="text-right">{L.col_actions}</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b: any) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap font-medium text-slate-900">{formatDate(b.booking_date)}</Td>
                  <Td label={L.cr_court} className="text-slate-600">{b.court?.name ?? "—"}</Td>
                  <Td label={L.cb_member} className="text-slate-600">{b.member?.full_name ?? "—"}</Td>
                  <Td label={L.col_time} className="whitespace-nowrap text-slate-500">{hhmm(b.start_time)}–{hhmm(b.end_time)}</Td>
                  <Td label={L.fp_amount} className="font-medium text-slate-900">{formatCurrency(Number(b.amount), b.currency)}</Td>
                  <Td label={L.col_status}>
                    <Badge tone={b.status === "confirmed" ? "green" : b.status === "canceled" ? "slate" : "yellow"}>{bkStatus[b.status] ?? b.status}</Badge>
                  </Td>
                  <Td label={L.col_actions} className="text-right">
                    {b.status !== "canceled" && (
                      <form action={cancelBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <ConfirmButton confirmText={L.cb_cancel_confirm} label={L.inv_cancel_label} />
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : (
        <EmptyState message={L.cb_empty} />
      )}
    </div>
  );
}
