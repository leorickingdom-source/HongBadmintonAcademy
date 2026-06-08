import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
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
              <tr key={r.id}>
                <Td className="font-medium text-slate-900">{r.name}</Td>
                <Td>{r.points}</Td>
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
      ) : (
        <EmptyState message="No reward rules yet." />
      )}
    </div>
  );
}
