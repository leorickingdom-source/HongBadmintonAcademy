import { Card, Field, Input, Select, Textarea, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { dict } from "@/lib/i18n";

type Tier = { id: string; name: string; amount: number; currency: string };
type Member = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  tier_id: string | null;
  status: string;
  notes: string | null;
};

export function ClubMemberForm({
  action,
  member,
  tiers,
  error,
  locale,
}: {
  action: (formData: FormData) => void;
  member?: Member;
  tiers: Tier[];
  error?: string;
  locale?: string | null;
}) {
  const L = dict(locale);
  return (
    <Card className="max-w-xl p-6">
      <form action={action} className="space-y-4">
        {member && <input type="hidden" name="id" value={member.id} />}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <Field label={L.sf_full_name} required>
          <Input name="full_name" defaultValue={member?.full_name ?? ""} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L.email_label}>
            <Input type="email" name="email" defaultValue={member?.email ?? ""} />
          </Field>
          <Field label={L.phone_label}>
            <Input name="phone" defaultValue={member?.phone ?? ""} />
          </Field>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={L.cmf_tier} hint={L.cmf_tier_hint}>
            <Select name="tier_id" defaultValue={member?.tier_id ?? ""}>
              <option value="">{L.none}</option>
              {tiers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} · {t.currency} {Number(t.amount).toFixed(2)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={L.col_status}>
            <Select name="status" defaultValue={member?.status ?? "active"}>
              <option value="active">{L.adm_active}</option>
              <option value="inactive">{L.adm_inactive}</option>
            </Select>
          </Field>
        </div>

        <Field label={L.f_notes}>
          <Textarea name="notes" defaultValue={member?.notes ?? ""} />
        </Field>

        <div className="flex gap-2 pt-2">
          <SubmitButton pendingText={L.cr_saving}>{member ? L.br_save_changes : L.cmf_add_member}</SubmitButton>
          <LinkButton href="/admin/club" variant="secondary">{L.inv_cancel_label}</LinkButton>
        </div>
      </form>
    </Card>
  );
}
