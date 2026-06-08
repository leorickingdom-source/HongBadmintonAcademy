import { Card, Field, Input, Textarea, Button, LinkButton } from "@/components/ui";
import type { RewardRule } from "@/lib/types";

export function RewardForm({
  action,
  rule,
  error,
}: {
  action: (formData: FormData) => void;
  rule?: RewardRule;
  error?: string;
}) {
  return (
    <Card className="max-w-2xl p-6">
      <form action={action} className="space-y-4">
        {rule && <input type="hidden" name="id" value={rule.id} />}
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <Field label="Rule name" required>
          <Input name="name" defaultValue={rule?.name ?? ""} required />
        </Field>

        <Field label="Points" hint="Points awarded when this rule is met.">
          <Input type="number" name="points" defaultValue={rule?.points ?? 0} />
        </Field>

        <Field label="Description">
          <Textarea name="description" defaultValue={rule?.description ?? ""} />
        </Field>

        <Field
          label="Config (JSON)"
          hint='Client-provided logic, e.g. {"type":"attendance","threshold":1.0}'
        >
          <Textarea
            name="config"
            defaultValue={rule?.config ? JSON.stringify(rule.config, null, 2) : ""}
            className="font-mono text-xs"
          />
        </Field>

        <div className="flex gap-2 pt-2">
          <Button type="submit">{rule ? "Save changes" : "Create rule"}</Button>
          <LinkButton href="/admin/rewards" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
