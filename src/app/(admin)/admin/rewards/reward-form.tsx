import { Card, Field, Input, Textarea, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { RewardRule } from "@/lib/types";
import { dict } from "@/lib/i18n";

export function RewardForm({
  action,
  rule,
  error,
  locale,
}: {
  action: (formData: FormData) => void;
  rule?: RewardRule;
  error?: string;
  locale?: string | null;
}) {
  const L = dict(locale);
  return (
    <Card className="max-w-2xl p-6">
      <form action={action} className="space-y-4">
        {rule && <input type="hidden" name="id" value={rule.id} />}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <Field label={L.rwf_rule_name} required>
          <Input name="name" defaultValue={rule?.name ?? ""} required />
        </Field>

        <Field label={L.rw_points} hint={L.rwf_points_hint}>
          <Input type="number" name="points" defaultValue={rule?.points ?? 0} />
        </Field>

        <Field label={L.cf_description}>
          <Textarea name="description" defaultValue={rule?.description ?? ""} />
        </Field>

        <Field
          label={L.rwf_config}
          hint={L.rwf_config_hint}
        >
          <Textarea
            name="config"
            defaultValue={rule?.config ? JSON.stringify(rule.config, null, 2) : ""}
            className="font-mono text-xs"
          />
        </Field>

        <div className="flex gap-2 pt-2">
          <SubmitButton pendingText={L.cr_saving}>{rule ? L.br_save_changes : L.rwf_create_rule}</SubmitButton>
          <LinkButton href="/admin/rewards" variant="secondary">
            {L.inv_cancel_label}
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
