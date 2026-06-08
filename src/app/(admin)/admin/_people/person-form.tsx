import { Card, Field, Input, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import type { Profile, Role } from "@/lib/types";

export function PersonForm({
  action,
  role,
  person,
  error,
}: {
  action: (formData: FormData) => void;
  role: Role;
  person?: Profile;
  error?: string;
}) {
  const base = role === "coach" ? "/admin/coaches" : "/admin/parents";
  const label = role === "coach" ? "coach" : "parent";

  return (
    <Card className="max-w-xl p-6">
      <form action={action} className="space-y-4">
        {person && <input type="hidden" name="id" value={person.id} />}
        {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <Field label="Full name" required>
          <Input name="full_name" defaultValue={person?.full_name ?? ""} required />
        </Field>

        <Field
          label="Email"
          required
          hint={person ? "Email can't be changed here." : "Used to sign in."}
        >
          <Input
            type="email"
            name="email"
            defaultValue={person?.email ?? ""}
            required
            readOnly={!!person}
            className={person ? "bg-slate-50 text-slate-500" : undefined}
          />
        </Field>

        <Field label="Phone (WhatsApp)" hint="E.164 format, e.g. +60123456789">
          <Input name="phone" defaultValue={person?.phone ?? ""} placeholder="+60…" />
        </Field>

        <Field
          label={person ? "Reset password" : "Password"}
          required={!person}
          hint={person ? "Leave blank to keep current password." : "Min 8 characters."}
        >
          <Input type="password" name="password" autoComplete="new-password" />
        </Field>

        <div className="flex gap-2 pt-2">
          <SubmitButton pendingText="Saving…">{person ? "Save changes" : `Create ${label}`}</SubmitButton>
          <LinkButton href={base} variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
