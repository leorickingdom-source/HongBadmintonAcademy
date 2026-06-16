import { Card, Field, Input, Select, Textarea, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { FeePlan } from "@/lib/types";
import { CLASS_RANKS } from "@/lib/ranks";

export function FeePlanForm({
  action,
  plan,
  error,
}: {
  action: (formData: FormData) => void;
  plan?: FeePlan;
  error?: string;
}) {
  return (
    <Card className="max-w-xl p-6">
      <form action={action} className="space-y-4">
        {plan && <input type="hidden" name="id" value={plan.id} />}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <Field label="Plan name" required>
          <Input name="name" defaultValue={plan?.name ?? ""} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount" required>
            <Input
              type="number"
              step="0.01"
              min="0"
              name="amount"
              defaultValue={plan?.amount ?? ""}
              required
            />
          </Field>
          <Field label="Billing">
            <Select name="interval" defaultValue={plan?.interval ?? "monthly"}>
              <option value="monthly">Monthly</option>
              <option value="one_time">One-time</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Currency">
            <Input name="currency" defaultValue={plan?.currency ?? "MYR"} />
          </Field>
          <Field label="Class rank" hint="Optional — tag this plan to a tier.">
            <Select name="rank" defaultValue={plan?.rank ?? ""}>
              <option value="">— none —</option>
              {CLASS_RANKS.map((r) => (
                <option key={r} value={r}>{r}</option>
              ))}
            </Select>
          </Field>
        </div>

        <Field label="Description">
          <Textarea name="description" defaultValue={plan?.description ?? ""} />
        </Field>

        <div className="flex gap-2 pt-2">
          <SubmitButton pendingText="Saving…">{plan ? "Save changes" : "Create plan"}</SubmitButton>
          <LinkButton href="/admin/fee-plans" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
