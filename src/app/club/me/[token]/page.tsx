import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { verifyClubToken } from "@/lib/club-auth";
import { formatCurrency, formatDate } from "@/lib/format";
import { SubmitButton } from "@/components/submit-button";
import { payMemberInvoice, renewMembership, bookCourt } from "./actions";

export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, string> = {
  active: "bg-emerald-100 text-emerald-700",
  pending: "bg-amber-100 text-amber-700",
  inactive: "bg-slate-100 text-slate-600",
};

export default async function ClubPortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; error?: string }>;
}) {
  const { token } = await params;
  const { paid, error } = await searchParams;
  const memberId = verifyClubToken(token);
  if (!memberId) notFound();

  const db = createAdminClient();
  const { data: member } = await db
    .from("club_members")
    .select("id, full_name, status, joined_at, tier:fee_plans!club_members_tier_id_fkey(name, amount, currency, interval)")
    .eq("id", memberId)
    .maybeSingle();
  if (!member) notFound();

  const { data: invoices } = await db
    .from("invoices")
    .select("id, amount, currency, description, status, due_date, period_month, paid_at")
    .eq("club_member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(24);

  const [{ data: courts }, { data: bookings }] = await Promise.all([
    db.from("courts").select("id, name, hourly_rate, currency").eq("active", true).gt("hourly_rate", 0).order("name"),
    db
      .from("court_bookings")
      .select("id, booking_date, start_time, end_time, amount, currency, status, court:courts(name)")
      .eq("club_member_id", memberId)
      .neq("status", "canceled")
      .order("booking_date", { ascending: false })
      .limit(12),
  ]);

  const all = invoices ?? [];
  const outstanding = all.filter((i: any) => i.status === "unpaid" || i.status === "overdue");
  const tier = (member as any).tier;
  const m = member as any;
  const hhmm = (t: string) => (t ? String(t).slice(0, 5) : "");
  const courtList = courts ?? [];
  const bookingList = bookings ?? [];

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col gap-5 px-5 py-10">
      <div className="flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-sm font-bold text-white">HBA</div>
        <div>
          <h1 className="text-xl font-bold text-slate-900">{m.full_name}</h1>
          <p className="text-xs text-slate-500">Club membership</p>
        </div>
      </div>

      {paid && <p className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">Payment received — thank you! Your membership is up to date.</p>}
      {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-500">Membership</span>
          <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_TONE[m.status] ?? STATUS_TONE.inactive}`}>{m.status}</span>
        </div>
        <div className="mt-1 text-lg font-bold text-slate-900">{tier?.name ?? "No tier assigned"}</div>
        {tier && (
          <div className="text-sm text-slate-500">
            {formatCurrency(Number(tier.amount), tier.currency)}{tier.interval === "monthly" ? " / month" : ""}
          </div>
        )}
        {m.joined_at && <div className="mt-2 text-xs text-slate-400">Member since {formatDate(m.joined_at)}</div>}
      </div>

      {outstanding.length > 0 ? (
        <div className="space-y-2">
          <div className="text-sm font-semibold text-slate-700">Amount due</div>
          {outstanding.map((i: any) => (
            <div key={i.id} className="flex items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <div className="min-w-0">
                <div className="font-semibold text-slate-900">{formatCurrency(Number(i.amount), i.currency)}</div>
                <div className="truncate text-xs text-slate-500">{i.description || "Club membership"}{i.due_date ? ` · due ${formatDate(i.due_date)}` : ""}</div>
              </div>
              <form action={payMemberInvoice}>
                <input type="hidden" name="token" value={token} />
                <input type="hidden" name="invoice_id" value={i.id} />
                <SubmitButton pendingText="Redirecting…">Pay now</SubmitButton>
              </form>
            </div>
          ))}
        </div>
      ) : (
        <form action={renewMembership} className="rounded-xl border border-slate-200 bg-slate-50 p-4">
          <input type="hidden" name="token" value={token} />
          <div className="mb-2 text-sm text-slate-600">You&apos;re all paid up. Renew early for the next period whenever you like.</div>
          <SubmitButton variant="secondary" pendingText="Redirecting…">Renew membership</SubmitButton>
        </form>
      )}

      {all.some((i: any) => i.status === "paid") && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-700">Payment history</div>
          <div className="divide-y divide-slate-100">
            {all.filter((i: any) => i.status === "paid").map((i: any) => (
              <div key={i.id} className="flex items-center justify-between py-2 text-sm">
                <span className="text-slate-500">{i.paid_at ? formatDate(i.paid_at) : formatDate(i.period_month)}</span>
                <span className="font-medium text-slate-800">{formatCurrency(Number(i.amount), i.currency)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {bookingList.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-2 text-sm font-semibold text-slate-700">Your court bookings</div>
          <div className="divide-y divide-slate-100">
            {bookingList.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <div className="min-w-0">
                  <div className="font-medium text-slate-800">{b.court?.name ?? "Court"}</div>
                  <div className="text-xs text-slate-500">{formatDate(b.booking_date)} · {hhmm(b.start_time)}–{hhmm(b.end_time)}</div>
                </div>
                <span className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${b.status === "confirmed" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{b.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {courtList.length > 0 && (
        <form action={bookCourt} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <input type="hidden" name="token" value={token} />
          <div className="mb-3 text-sm font-semibold text-slate-700">Book a court</div>
          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Court</span>
              <select name="court_id" required className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                {courtList.map((c: any) => (
                  <option key={c.id} value={c.id}>{c.name} · {formatCurrency(Number(c.hourly_rate), c.currency)}/h</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-3 gap-2">
              <label className="col-span-2 block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Date</span>
                <input type="date" name="booking_date" required className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-slate-500">Hours</span>
                <select name="hours" defaultValue="1" className="h-10 w-full rounded-lg border border-slate-300 px-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500">
                  {["1", "1.5", "2", "2.5", "3"].map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            </div>
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-slate-500">Start time</span>
              <input type="time" name="start_time" required step="900" className="h-10 w-full rounded-lg border border-slate-300 px-3 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500" />
            </label>
          </div>
          <div className="mt-4">
            <SubmitButton pendingText="Redirecting…">Book &amp; pay</SubmitButton>
          </div>
          <p className="mt-2 text-xs text-slate-400">You pay for the court up front. The booking confirms once payment clears.</p>
        </form>
      )}

      <p className="text-center text-xs text-slate-400">Keep this link private — it opens your membership.</p>
    </main>
  );
}
