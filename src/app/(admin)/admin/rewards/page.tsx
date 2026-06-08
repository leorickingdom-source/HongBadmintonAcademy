import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { deleteRewardRule } from "./actions";

export const dynamic = "force-dynamic";

export default async function RewardsPage() {
  const supabase = await createClient();
  const { data: rules } = await supabase.from("reward_rules").select("*").order("name");

  return (
    <div>
      <PageHeader
        title="Reward Rules"
        description="Configure the reward logic provided by the client."
        action={<LinkButton href="/admin/rewards/new">+ New rule</LinkButton>}
      />

      {rules && rules.length > 0 ? (
        <Section title={`Rules (${rules.length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Points</Th>
                <Th>Active</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((r: any) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{r.name}</Td>
                  <Td><Badge tone="green">+{r.points}</Badge></Td>
                  <Td>
                    <Badge tone={r.is_active ? "green" : "slate"}>
                      {r.is_active ? "active" : "inactive"}
                    </Badge>
                  </Td>
                  <Td className="text-right">
                    <div className="flex justify-end gap-2">
                      <LinkButton href={`/admin/rewards/${r.id}`} variant="secondary">
                        Edit
                      </LinkButton>
                      <form action={deleteRewardRule}>
                        <input type="hidden" name="id" value={r.id} />
                        <ConfirmButton confirmText={`Delete rule "${r.name}"?`} />
                      </form>
                    </div>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </Section>
      ) : (
        <EmptyState message="No reward rules yet." />
      )}
    </div>
  );
}
