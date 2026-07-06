import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getViewBranchId, listBranches } from "@/lib/branch";
import { PageHeader, StatCard, Section, Table, Th, Td, EmptyState, Input, Select, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { formatCurrency, formatDate } from "@/lib/format";
import { createCourt, deleteCourt, logRental, deleteRental } from "./actions";

export const dynamic = "force-dynamic";

function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function CourtRentalsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const me = await requireSuperAdmin();
  const supabase = await createClient();
  const bf = await getViewBranchId(me);

  const { month } = await searchParams;
  const monthStr = /^\d{4}-\d{2}$/.test(month ?? "") ? month! : todayMYT().slice(0, 7);
  const [y, m] = monthStr.split("-").map(Number);
  const start = `${monthStr}-01`;
  const end = new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
  const prevM = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, "0")}`;
  const nextM = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}`;
  const thisM = todayMYT().slice(0, 7);
  const monthLabelStr = new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString("en-MY", { month: "long", year: "numeric" });

  let courtsQ = supabase.from("courts").select("id, name, hourly_rate, currency, branch_id, active").order("name");
  if (bf) courtsQ = courtsQ.eq("branch_id", bf);
  let rentalsQ = supabase
    .from("court_rentals")
    .select("id, court_id, rental_date, hours, amount, note, courts(name, currency)")
    .gte("rental_date", start)
    .lte("rental_date", end)
    .order("rental_date", { ascending: false });
  if (bf) rentalsQ = rentalsQ.eq("branch_id", bf);

  const [{ data: courts }, { data: rentals }, branches] = await Promise.all([
    courtsQ,
    rentalsQ,
    listBranches(false),
  ]);

  const courtList = (courts ?? []) as any[];
  const rentalList = (rentals ?? []) as any[];
  const currency = courtList[0]?.currency ?? rentalList[0]?.courts?.currency ?? "MYR";

  // Per-court rollup for the month.
  type Agg = { name: string; count: number; hours: number; amount: number };
  const byCourt = new Map<string, Agg>();
  for (const r of rentalList) {
    const cur = byCourt.get(r.court_id) ?? { name: r.courts?.name ?? "—", count: 0, hours: 0, amount: 0 };
    cur.count += 1;
    cur.hours += Number(r.hours);
    cur.amount += Number(r.amount);
    byCourt.set(r.court_id, cur);
  }
  const rows = [...byCourt.values()].sort((a, b) => b.amount - a.amount);
  const totalAmount = rentalList.reduce((s, r) => s + Number(r.amount), 0);
  const totalHours = rentalList.reduce((s, r) => s + Number(r.hours), 0);

  const branchName = new Map(branches.map((b) => [b.id, b.name]));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Court Rentals"
        description="What the academy pays to rent courts, per court, per month — for cost analysis."
        action={<LinkButton href={`/api/court-rentals/csv?month=${monthStr}`} target="_blank" rel="noopener" variant="secondary">CSV</LinkButton>}
      />

      {/* Month control */}
      <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <Link href={`/admin/court-rentals?month=${prevM}`} aria-label="Previous month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <div className="text-center">
          <div className="text-sm font-semibold text-slate-900">{monthLabelStr}</div>
          {monthStr !== thisM && (
            <Link href={`/admin/court-rentals?month=${thisM}`} className="text-xs font-medium text-green-700 hover:underline">Jump to this month</Link>
          )}
        </div>
        <Link href={`/admin/court-rentals?month=${nextM}`} aria-label="Next month" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
          <ChevronRight className="h-5 w-5" />
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard label="Rental cost this month" value={formatCurrency(totalAmount, currency)} tone="red" />
        <StatCard label="Total hours" value={totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)} tone="slate" />
        <StatCard label="Courts" value={courtList.length} tone="blue" />
      </div>

      {/* Per-court report */}
      <Section title={`Cost by court — ${monthLabelStr}`} flush>
        {rows.length ? (
          <Table>
            <thead>
              <tr><Th>Court</Th><Th className="text-right">Rentals</Th><Th className="text-right">Hours</Th><Th className="text-right">Cost</Th></tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{r.name}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{r.count}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{r.hours % 1 === 0 ? r.hours : r.hours.toFixed(1)}</Td>
                  <Td className="text-right font-semibold tabular-nums text-slate-900">{formatCurrency(r.amount, currency)}</Td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                <Td className="text-slate-900">Total</Td>
                <Td className="text-right tabular-nums text-slate-500">{rentalList.length}</Td>
                <Td className="text-right tabular-nums text-slate-500">{totalHours % 1 === 0 ? totalHours : totalHours.toFixed(1)}</Td>
                <Td className="text-right tabular-nums text-slate-900">{formatCurrency(totalAmount, currency)}</Td>
              </tr>
            </tbody>
          </Table>
        ) : (
          <div className="p-5"><EmptyState message="No court rentals logged for this month yet." /></div>
        )}
      </Section>

      {/* Log a rental */}
      <Section title="Log a court rental">
        {courtList.length ? (
          <form action={logRental} className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">Court</span>
              <Select name="court_id" defaultValue="" className="h-9 w-48" required>
                <option value="" disabled>Select court…</option>
                {courtList.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}{c.hourly_rate ? ` (${formatCurrency(Number(c.hourly_rate), c.currency)}/h)` : ""}</option>
                ))}
              </Select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">Date</span>
              <Input type="date" name="rental_date" defaultValue={todayMYT()} className="h-9 w-40" required />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">Hours</span>
              <Input type="number" name="hours" step="0.5" min="0" placeholder="2" className="h-9 w-24" />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">Amount</span>
              <Input type="number" name="amount" step="0.01" min="0" placeholder="0.00" className="h-9 w-28" required />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-slate-500">Note</span>
              <Input name="note" placeholder="optional" maxLength={200} className="h-9 w-40" />
            </label>
            <SubmitButton pendingText="Saving…">Add rental</SubmitButton>
          </form>
        ) : (
          <p className="text-sm text-slate-500">Add a court first to start logging rentals.</p>
        )}
      </Section>

      {/* Recent rentals (this month) */}
      {rentalList.length > 0 && (
        <Section title="Rentals this month" flush>
          <Table>
            <thead>
              <tr><Th>Date</Th><Th>Court</Th><Th className="text-right">Hours</Th><Th className="text-right">Amount</Th><Th>Note</Th><Th className="text-right">·</Th></tr>
            </thead>
            <tbody>
              {rentalList.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="text-slate-500">{formatDate(r.rental_date)}</Td>
                  <Td className="font-medium text-slate-900">{r.courts?.name ?? "—"}</Td>
                  <Td className="text-right tabular-nums text-slate-500">{Number(r.hours) % 1 === 0 ? Number(r.hours) : Number(r.hours).toFixed(1)}</Td>
                  <Td className="text-right tabular-nums text-slate-900">{formatCurrency(Number(r.amount), currency)}</Td>
                  <Td className="text-slate-500">{r.note ?? ""}</Td>
                  <Td className="text-right">
                    <form action={deleteRental}>
                      <input type="hidden" name="id" value={r.id} />
                      <ConfirmButton confirmText="Delete this rental entry?" />
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      )}

      {/* Manage courts */}
      <Section title="Courts">
        <form action={createCourt} className="flex flex-wrap items-end gap-3 border-b border-slate-100 pb-4">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500">Court name</span>
            <Input name="name" placeholder="Court 1" maxLength={80} className="h-9 w-40" required />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500">Branch</span>
            <Select name="branch_id" defaultValue="" className="h-9 w-44">
              <option value="">— shared / none —</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-500">Rate / hour</span>
            <Input type="number" name="hourly_rate" step="0.01" min="0" placeholder="0.00" className="h-9 w-28" />
          </label>
          <SubmitButton variant="secondary" pendingText="Adding…">Add court</SubmitButton>
        </form>

        {courtList.length ? (
          <ul className="divide-y divide-slate-100">
            {courtList.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
                <span className="font-medium text-slate-900">{c.name}</span>
                {c.branch_id && <span className="text-xs text-slate-400">{branchName.get(c.branch_id) ?? "branch"}</span>}
                <span className="text-sm text-slate-500">{c.hourly_rate ? `${formatCurrency(Number(c.hourly_rate), c.currency)}/h` : "no rate"}</span>
                <form action={deleteCourt} className="ml-auto">
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton confirmText="Delete this court and all its rental entries?" />
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="pt-4 text-sm text-slate-500">No courts yet — add one above.</p>
        )}
      </Section>
    </div>
  );
}
