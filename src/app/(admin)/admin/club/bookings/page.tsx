import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatDate, formatCurrency } from "@/lib/format";
import { cancelBooking } from "../actions";

export const dynamic = "force-dynamic";

const hhmm = (t: string) => (t ? String(t).slice(0, 5) : "");

export default async function CourtBookingsPage({
  searchParams,
}: {
  searchParams: Promise<{ canceled?: string; error?: string }>;
}) {
  await requireSuperAdmin();
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
        title="Court Bookings"
        description="Member court reservations. Paid bookings are club revenue (see Pots)."
        action={<LinkButton href="/admin/club" variant="secondary">← Club Members</LinkButton>}
      />

      {canceled && <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">Booking canceled.</p>}
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {rows.length > 0 ? (
        <Section title={`Bookings (${rows.length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>Date</Th>
                <Th>Court</Th>
                <Th>Member</Th>
                <Th>Time</Th>
                <Th>Amount</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((b: any) => (
                <tr key={b.id} className="hover:bg-slate-50">
                  <Td className="whitespace-nowrap font-medium text-slate-900">{formatDate(b.booking_date)}</Td>
                  <Td label="Court" className="text-slate-600">{b.court?.name ?? "—"}</Td>
                  <Td label="Member" className="text-slate-600">{b.member?.full_name ?? "—"}</Td>
                  <Td label="Time" className="whitespace-nowrap text-slate-500">{hhmm(b.start_time)}–{hhmm(b.end_time)}</Td>
                  <Td label="Amount" className="font-medium text-slate-900">{formatCurrency(Number(b.amount), b.currency)}</Td>
                  <Td label="Status">
                    <Badge tone={b.status === "confirmed" ? "green" : b.status === "canceled" ? "slate" : "yellow"}>{b.status}</Badge>
                  </Td>
                  <Td label="Actions" className="text-right">
                    {b.status !== "canceled" && (
                      <form action={cancelBooking}>
                        <input type="hidden" name="id" value={b.id} />
                        <ConfirmButton confirmText="Cancel this booking?" label="Cancel" />
                      </form>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : (
        <EmptyState message="No court bookings yet." />
      )}
    </div>
  );
}
