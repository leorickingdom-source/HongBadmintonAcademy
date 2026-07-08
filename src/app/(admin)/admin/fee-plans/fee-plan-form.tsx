import { Card, Field, Input, Select, Textarea, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { FeePlan } from "@/lib/types";
import { CLASS_RANKS } from "@/lib/ranks";
import { dict } from "@/lib/i18n";

export function FeePlanForm({
  action,
  plan,
  error,
  locale,
}: {
  action: (formData: FormData) => void;
  plan?: FeePlan;
  error?: string;
  locale?: string | null;
}) {
  const L = dict(locale);
  return (
    <Card className="max-w-xl p-6">
      <form action={action} className="space-y-4">
        {plan && <input type="hidden" name="id" value={plan.id} />}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <Field label={L.fpf_plan_name} required>
          <Input name="name" defaultValue={plan?.name ?? ""} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L.fp_amount} required>
            <Input
              type="number"
              step="0.01"
              min="0"
              name="amount"
              defaultValue={plan?.amount ?? ""}
              required
            />
          </Field>
          <Field label={L.fp_billing}>
            <Select name="interval" defaultValue={plan?.interval ?? "monthly"}>
              <option value="monthly">{L.fp_monthly}</option>
              <option value="one_time">{L.fp_one_time}</option>
            </Select>
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L.cr_arm} hint={L.fpf_arm_hint}>
            <Select name="business" defaultValue={plan?.business ?? "academy"}>
              <option value="academy">{L.cr_academy}</option>
              <option value="club">{L.cr_club}</option>
            </Select>
          </Field>
          <Field label={L.fpf_currency}>
            <Input name="currency" defaultValue={plan?.currency ?? "MYR"} />
          </Field>
        </div>

        <Field label={L.level_word} hint={L.fpf_level_hint}>
          <Select name="rank" defaultValue={plan?.rank ?? ""}>
            <option value="">{L.none}</option>
            {CLASS_RANKS.map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </Select>
        </Field>

        <Field label={L.cf_description}>
          <Textarea name="description" defaultValue={plan?.description ?? ""} />
        </Field>

        <div className="flex gap-2 pt-2">
          <SubmitButton pendingText={L.cr_saving}>{plan ? L.br_save_changes : L.fpf_create_plan}</SubmitButton>
          <LinkButton href="/admin/fee-plans" variant="secondary">
            {L.inv_cancel_label}
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
