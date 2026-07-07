import Link from "next/link";
import { Users, CalendarClock, TrendingUp, Wallet, Tag, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { getViewBranchId } from "@/lib/branch";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { formatDate, formatCurrency } from "@/lib/format";
import { signClubToken } from "@/lib/club-auth";
import { getBaseUrl } from "@/lib/url";
import { computePots } from "@/lib/pots";
import { deleteClubMember, raiseMemberInvoice, generateClubDuesNow } from "./actions";

export const dynamic = "force-dynamic";

function todayMYT(): string {
  return new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

export default async function ClubHubPage({
  searchParams,
}: {
  searchParams: Promise<{ raised?: string; dues?: string; error?: string }>;
}) {
  const me = await requireSuperAdmin();
  const { raised, dues, error } = await searchParams;
  const supabase = await createClient();
  const branchId = await getViewBranchId(me);
  const [{ data: members }, pots, { count: upcomingBookings }] = await Promise.all([
    supabase
      .from("club_members")
      .select("id, full_name, email, phone, status, joined_at, tier:fee_plans!club_members_tier_id_fkey(name)")
      .order("full_name"),
    computePots(supabase, new Date(), branchId),
    supabase
      .from("court_bookings")
      .select("id", { count: "exact", head: true })
      .gte("booking_date", todayMYT())
      .neq("status", "canceled"),
  ]);
  const baseUrl = await getBaseUrl();
  const memberRows = members ?? [];
  const activeCount = memberRows.filter((m: any) => m.status === "active").length;
  const pendingCount = memberRows.filter((m: any) => m.status === "pending").length;

  const TILES = [
    { label: "Active members", value: String(activeCount), sub: pendingCount ? `${pendingCount} pending` : "members", Icon: Users },
    { label: "Club revenue", value: formatCurrency(pots.club.collected, "MYR"), sub: `collected · ${pots.monthLabel}`, Icon: TrendingUp },
    { label: "Available to draw", value: formatCurrency(pots.club.available, "MYR"), sub: "club pot", Icon: Wallet },
    { label: "Upcoming bookings", value: String(upcomingBookings ?? 0), sub: "courts", Icon: CalendarClock },
  ];
  const LINKS = [
    { href: "/admin/club/bookings", label: "Court bookings", desc: "Member reservations", Icon: CalendarClock },
    { href: "/admin/pots", label: "Revenue & P&L", desc: "Academy vs Club pots", Icon: TrendingUp },
    { href: "/admin/fee-plans", label: "Membership tiers", desc: "Club fee plans", Icon: Tag },
    { href: "/admin/court-rentals", label: "Court costs", desc: "Rentals by arm", Icon: Wallet },
    { href: "/club", label: "Public signup page", desc: "Share to join", Icon: ExternalLink, external: true },
  ];

  return (
    <div>
      <PageHeader
        title="Club"
        description="Everything for the club business arm — members, dues, court bookings and revenue in one place."
        action={
          <>
            <a
              href="/club"
              target="_blank"
              rel="noopener"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Public signup page ↗
            </a>
            <LinkButton href="/admin/club/bookings" variant="secondary">Court bookings</LinkButton>
            <form action={generateClubDuesNow}>
              <SubmitButton variant="secondary" pendingText="Generating…">Generate dues</SubmitButton>
            </form>
            <LinkButton href="/admin/club/new">+ Add member</LinkButton>
          </>
        }
      />

      {raised && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Membership invoice raised — see it in Invoices and Pots.
        </p>
      )}
      {dues !== undefined && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Generated {dues} membership due invoice{dues === "1" ? "" : "s"} for this month.
        </p>
      )}
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      {/* Overview tiles */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {TILES.map((t) => (
          <div key={t.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <t.Icon className="h-3.5 w-3.5" />{t.label}
            </div>
            <div className="mt-1 text-2xl font-bold text-slate-900">{t.value}</div>
            <div className="text-xs text-slate-400">{t.sub}</div>
          </div>
        ))}
      </div>

      {/* Quick links to every club area */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {LINKS.map((l) =>
          l.external ? (
            <a key={l.href} href={l.href} target="_blank" rel="noopener" className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/40">
              <l.Icon className="h-5 w-5 text-emerald-600" />
              <div className="mt-2 text-sm font-semibold text-slate-900">{l.label} ↗</div>
              <div className="text-xs text-slate-400">{l.desc}</div>
            </a>
          ) : (
            <Link key={l.href} href={l.href} className="group rounded-xl border border-slate-200 bg-white p-4 shadow-sm hover:border-emerald-300 hover:bg-emerald-50/40">
              <l.Icon className="h-5 w-5 text-emerald-600" />
              <div className="mt-2 text-sm font-semibold text-slate-900">{l.label}</div>
              <div className="text-xs text-slate-400">{l.desc}</div>
            </Link>
          ),
        )}
      </div>

      {members && members.length > 0 ? (
        <Section title={`Members (${members.length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Tier</Th>
                <Th>Contact</Th>
                <Th>Status</Th>
                <Th>Joined</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {members.map((m: any) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{m.full_name}</Td>
                  <Td label="Tier">{m.tier?.name ?? <span className="text-slate-400">— none —</span>}</Td>
                  <Td label="Contact" className="text-slate-500">{m.email || m.phone || "—"}</Td>
                  <Td label="Status">
                    <Badge tone={m.status === "active" ? "green" : m.status === "pending" ? "yellow" : "slate"}>{m.status}</Badge>
                  </Td>
                  <Td label="Joined" className="text-slate-500">{m.joined_at ? formatDate(m.joined_at) : "—"}</Td>
                  <Td label="Actions" className="text-right">
                    <div className="flex justify-end gap-2">
                      <a
                        href={`${baseUrl}/club/me/${signClubToken(m.id)}`}
                        target="_blank"
                        rel="noopener"
                        className="inline-flex items-center rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
                        title="Open this member's personal portal link"
                      >
                        Portal ↗
                      </a>
                      <form action={raiseMemberInvoice}>
                        <input type="hidden" name="id" value={m.id} />
                        <SubmitButton variant="secondary" pendingText="Raising…">Raise invoice</SubmitButton>
                      </form>
                      <LinkButton href={`/admin/club/${m.id}`} variant="secondary">Edit</LinkButton>
                      <form action={deleteClubMember}>
                        <input type="hidden" name="id" value={m.id} />
                        <ConfirmButton confirmText={`Remove member "${m.full_name}"?`} />
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : (
        <EmptyState message="No club members yet. Add one to start club billing." />
      )}
    </div>
  );
}
