import { Card, Field, Input, Select, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { PasswordField } from "./password-field";
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
}) {
  const base = cancelHref ?? (role === "coach" ? "/admin/coaches" : "/admin/parents");
  const label = role === "coach" ? "coach" : role === "parent" ? "parent" : "staff";

  return (
    <Card className="max-w-xl p-6">
      <form action={action} className="space-y-4">
        {person && <input type="hidden" name="id" value={person.id} />}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        {roleOptions && (
          <Field label="Role" required>
            <Select name="role" defaultValue={person?.role ?? roleOptions[0]?.value}>
              {roleOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Full name" required>
          <Input name="full_name" defaultValue={person?.full_name ?? ""} required />
        </Field>

        <Field
          label="Email"
          required
          hint={person ? (allowEmailEdit ? "Changing this changes their sign-in email." : "Email can't be changed here.") : "Used to sign in."}
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

        <Field label="Phone (WhatsApp)" hint="E.164 format, e.g. +60123456789">
          <Input name="phone" defaultValue={person?.phone ?? ""} placeholder="+60…" />
        </Field>

        {showBranch && (
          <Field label="Branch" hint="Which location this person belongs to.">
            <Select name="branch_id" defaultValue={person?.branch_id ?? defaultBranchId ?? ""}>
              <option value="">— none —</option>
              {(branches ?? []).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </Select>
          </Field>
        )}

        <Field
          label={person ? "Reset password" : "Password"}
          required={!person}
          hint={person ? "Leave blank to keep current password." : "Min 8 characters — tap Show to check it."}
        >
          <PasswordField required={!person} />
        </Field>

        <div className="flex gap-2 pt-2">
          <SubmitButton pendingText="Saving…">{submitLabel ?? (person ? "Save changes" : `Create ${label}`)}</SubmitButton>
          <LinkButton href={base} variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
