import { Card, Field, Input, Select, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PasswordField } from "./password-field";
import { dict } from "@/lib/i18n";
import type { Profile, Role } from "@/lib/types";

export function PersonForm({
  action,
  role,
  person,
  error,
  roleOptions,
  branches,
  showBranch,
  defaultBranchId,
  cancelHref,
  submitLabel,
  allowEmailEdit,
  locale,
}: {
  action: (formData: FormData) => void;
  role: Role;
  person?: Profile;
  error?: string;
  allowEmailEdit?: boolean;
  // When present, render a role <select name="role"> (used by the Staff page so
  // a super-admin can pick branch-admin vs super-admin vs coach).
  roleOptions?: { value: Role; label: string }[];
  // When showBranch, render a branch picker (coach/admin staff belong to one).
  branches?: { id: string; name: string }[];
  showBranch?: boolean;
  defaultBranchId?: string | null;
  cancelHref?: string;
  submitLabel?: string;
  locale?: string | null;
}) {
  const L = dict(locale);
  const base = cancelHref ?? (role === "coach" ? "/admin/coaches" : "/admin/parents");
  const label = role === "coach" ? L.pf_coach : role === "parent" ? L.pf_parent : L.pf_staff;

  return (
    <Card className="max-w-xl p-6">
      <form action={action} className="space-y-4">
        {person && <input type="hidden" name="id" value={person.id} />}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {roleOptions && (
          <Field label={L.pf_role} required>
            <Select name="role" defaultValue={person?.role ?? roleOptions[0]?.value}>
              {roleOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field label={L.sf_full_name} required>
          <Input name="full_name" defaultValue={person?.full_name ?? ""} required />
        </Field>

        <Field
          label={L.email_label}
          required
          hint={person ? (allowEmailEdit ? L.pf_email_hint_change : L.pf_email_hint_locked) : L.pf_email_hint_new}
        >
          <Input
            type="email"
            name="email"
            defaultValue={person?.email ?? ""}
            required
            readOnly={!!person && !allowEmailEdit}
            className={person && !allowEmailEdit ? "bg-slate-50 text-slate-500" : undefined}
          />
        </Field>

        <Field label={L.pf_phone_wa} hint={L.pf_phone_hint}>
          <Input name="phone" defaultValue={person?.phone ?? ""} placeholder="+60…" />
        </Field>

        {showBranch && (
          <Field label={L.branch} hint={L.pf_branch_hint}>
            <Select name="branch_id" defaultValue={person?.branch_id ?? defaultBranchId ?? ""}>
              <option value="">{L.none}</option>
              {(branches ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label={person ? L.pf_reset_pw : L.pf_password}
          required={!person}
          hint={person ? L.pf_pw_hint_edit : L.pf_pw_hint_new}
        >
          <PasswordField required={!person} />
        </Field>

        <div className="flex gap-2 pt-2">
          <SubmitButton pendingText={L.cr_saving}>{submitLabel ?? (person ? L.br_save_changes : L.pf_create.replace("{x}", label))}</SubmitButton>
          <LinkButton href={base} variant="secondary">
            {L.inv_cancel_label}
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
