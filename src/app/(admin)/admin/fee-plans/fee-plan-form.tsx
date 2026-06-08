import { Card, Field, Input, Select, Textarea, Button, LinkButton } from "@/components/ui";
import type { FeePlan } from "@/lib/types";

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
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

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

        <Field label="Currency">
          <Input name="currency" defaultValue={plan?.currency ?? "MYR"} />
        </Field>

        <Field label="Description">
          <Textarea name="description" defaultValue={plan?.description ?? ""} />
        </Field>

        <div className="flex gap-2 pt-2">
          <Button type="submit">{plan ? "Save changes" : "Create plan"}</Button>
          <LinkButton href="/admin/fee-plans" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
