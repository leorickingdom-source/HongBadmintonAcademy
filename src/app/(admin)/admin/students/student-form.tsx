import { Card, Field, Input, Select, Textarea, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { NfcTagInput } from "@/components/nfc-tag-input";
import type { Student } from "@/lib/types";

export function StudentForm({
  action,
  student,
  parents,
  error,
}: {
  action: (formData: FormData) => void;
  student?: Student;
  parents: { id: string; full_name: string | null }[];
  error?: string;
}) {
  return (
    <Card className="max-w-2xl p-6">
      <form action={action} className="space-y-4">
        {student && <input type="hidden" name="id" value={student.id} />}
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

        <Field label="Full name" required>
          <Input name="full_name" defaultValue={student?.full_name ?? ""} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Date of birth">
            <Input type="date" name="dob" defaultValue={student?.dob ?? ""} />
          </Field>
          <Field label="Gender">
            <Input name="gender" defaultValue={student?.gender ?? ""} placeholder="M / F" />
          </Field>
        </div>

        <Field label="Parent">
          <Select name="parent_id" defaultValue={student?.parent_id ?? ""}>
            <option value="">— none —</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id}>
                {p.full_name ?? p.id}
              </option>
            ))}
          </Select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="NFC tag UID" hint="Tap Scan and hold the card to your phone, or type it.">
            <NfcTagInput defaultValue={student?.nfc_tag_uid ?? ""} />
          </Field>
          <Field label="Status">
            <Select name="status" defaultValue={student?.status ?? "active"}>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </Select>
          </Field>
        </div>

        <Field label="Notes">
          <Textarea name="notes" defaultValue={student?.notes ?? ""} />
        </Field>

        <div className="flex gap-2 pt-2">
          <SubmitButton pendingText="Saving…">{student ? "Save changes" : "Create student"}</SubmitButton>
          <LinkButton href="/admin/students" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
