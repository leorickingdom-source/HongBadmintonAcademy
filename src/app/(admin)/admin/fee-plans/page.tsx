import { createClient } from "@/lib/supabase/server";
import { PageHeader, LinkButton, Table, Th, Td, Badge, EmptyState } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { formatCurrency } from "@/lib/format";
import { deleteFeePlan } from "./actions";

export const dynamic = "force-dynamic";

export default async function FeePlansPage() {
  const supabase = await createClient();
  const { data: plans } = await supabase.from("fee_plans").select("*").order("name");

  return (
    <div>
      <PageHeader
        title="Fee Plans"
        description="Reusable fee templates used to raise invoices."
        action={<LinkButton href="/admin/fee-plans/new">+ New plan</LinkButton>}
      />

      {plans && plans.length > 0 ? (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Amount</Th>
              <Th>Billing</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody>
            {plans.map((p: any) => (
              <tr key={p.id}>
                <Td className="font-medium text-slate-900">{p.name}</Td>
                <Td>{formatCurrency(Number(p.amount), p.currency)}</Td>
                <Td>
                  <Badge tone="blue">{p.interval}</Badge>
                </Td>
                <Td className="text-right">
                  <div className="flex justify-end gap-2">
                    <LinkButton href={`/admin/fee-plans/${p.id}`} variant="secondary">
                      Edit
                    </LinkButton>
                    <form action={deleteFeePlan}>
                      <input type="hidden" name="id" value={p.id} />
                      <ConfirmButton confirmText={`Delete plan "${p.name}"?`} />
                    </form>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : (
        <EmptyState message="No fee plans yet." />
      )}
    </div>
  );
}
