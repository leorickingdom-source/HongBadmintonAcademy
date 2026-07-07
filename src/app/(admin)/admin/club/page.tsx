import { createClient } from "@/lib/supabase/server";
import { requireSuperAdmin } from "@/lib/auth";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { formatDate } from "@/lib/format";
import { deleteClubMember, raiseMemberInvoice } from "./actions";

export const dynamic = "force-dynamic";

export default async function ClubMembersPage({
  searchParams,
}: {
  searchParams: Promise<{ raised?: string; error?: string }>;
}) {
  await requireSuperAdmin();
  const { raised, error } = await searchParams;
  const supabase = await createClient();
  const { data: members } = await supabase
    .from("club_members")
    .select("id, full_name, email, phone, status, joined_at, tier:fee_plans!club_members_tier_id_fkey(name)")
    .order("full_name");

  return (
    <div>
      <PageHeader
        title="Club Members"
        description="The club is a separate business arm. Dues raised here are tagged 'club' and show in Pots."
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
            <LinkButton href="/admin/club/new">+ Add member</LinkButton>
          </>
        }
      />

      {raised && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Membership invoice raised — see it in Invoices and Pots.
        </p>
      )}
      {error && <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

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
