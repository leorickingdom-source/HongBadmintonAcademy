import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, LinkButton, Table, Th, Td, Badge, EmptyState, cn } from "@/components/ui";
import { rankBadgeClass } from "@/lib/ranks";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";
import { formatCurrency } from "@/lib/format";
import { isStripeConfigured, env } from "@/lib/env";
import { stripeMode } from "@/lib/payments/stripe";
import { deleteFeePlan, syncFeePlansToStripe } from "./actions";

export const dynamic = "force-dynamic";

export default async function FeePlansPage({
  searchParams,
}: {
  searchParams: Promise<{ synced?: string; error?: string }>;
}) {
  const { synced, error } = await searchParams;
  const supabase = await createClient();
  const { data: plans } = await supabase.from("fee_plans").select("*").order("name");

  const configured = isStripeConfigured();
  const mode = stripeMode();
  const webhookSet = !!env.stripeWebhookSecret;

  return (
    <div>
      <PageHeader
        title="Fee Plans"
        description="Reusable fee templates used to raise invoices."
        action={
          <>
            <form action={syncFeePlansToStripe}>
              <SubmitButton variant="secondary" pendingText="Syncing…">Sync to Stripe</SubmitButton>
            </form>
            <LinkButton href="/admin/fee-plans/new">+ New plan</LinkButton>
          </>
        }
      />

      {/* Stripe status */}
      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm shadow-sm">
        <span className="font-medium text-slate-700">Stripe</span>
        {configured ? (
          <Badge tone={mode === "live" ? "green" : "blue"}>{mode === "live" ? "live" : "test"} mode</Badge>
        ) : (
          <Badge tone="yellow">not configured</Badge>
        )}
        <Badge tone={webhookSet ? "green" : "slate"}>{webhookSet ? "webhook set" : "no webhook secret"}</Badge>
        {!configured && (
          <span className="text-slate-500">Add STRIPE_SECRET_KEY to enable online payments — see STRIPE.md.</span>
        )}
      </div>

      {synced && (
        <p className="mb-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          Synced {synced} fee plan(s) to Stripe.
        </p>
      )}
      {error && (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      {plans && plans.length > 0 ? (
        <Section title={`Plans (${plans.length})`} flush>
          <Table>
            <thead>
              <tr>
                <Th>Name</Th>
                <Th>Rank</Th>
                <Th>Amount</Th>
                <Th>Billing</Th>
                <Th>Stripe</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p: any) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <Td className="font-medium text-slate-900">{p.name}</Td>
                  <Td label="Rank">
                    {p.rank ? (
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(p.rank))}>{p.rank}</span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </Td>
                  <Td className="font-medium text-slate-900">{formatCurrency(Number(p.amount), p.currency)}</Td>
                  <Td>
                    <Badge tone="blue">{p.interval === "one_time" ? "one-time" : p.interval}</Badge>
                  </Td>
                  <Td>
                    {p.stripe_price_id ? <Badge tone="green">synced</Badge> : <Badge tone="slate">—</Badge>}
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
        </Section>
      ) : (
        <EmptyState message="No fee plans yet." />
      )}
    </div>
  );
}
