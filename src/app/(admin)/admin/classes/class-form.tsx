import { Card, Field, Input, Select, Textarea, Button, LinkButton } from "@/components/ui";
import type { ClassRow } from "@/lib/types";

export function ClassForm({
  action,
  classRow,
  coaches,
  error,
  submitLabel,
}: {
  action: (formData: FormData) => void;
  classRow?: ClassRow;
  coaches: { id: string; full_name: string | null }[];
  error?: string;
  submitLabel?: string;
}) {
  return (
    <Card className="max-w-2xl p-6">
      <form action={action} className="space-y-4">
        {classRow && <input type="hidden" name="id" value={classRow.id} />}
        {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

        <Field label="Class name" required>
          <Input name="name" defaultValue={classRow?.name ?? ""} required />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Level">
            <Input name="level" defaultValue={classRow?.level ?? ""} placeholder="Beginner / Intermediate" />
          </Field>
          <Field label="Primary coach">
            <Select name="coach_id" defaultValue={classRow?.coach_id ?? ""}>
              <option value="">— none —</option>
              {coaches.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.full_name ?? c.id}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Default location">
            <Input name="default_location" defaultValue={classRow?.default_location ?? ""} />
          </Field>
          <Field label="Capacity">
            <Input type="number" name="capacity" defaultValue={classRow?.capacity ?? ""} />
          </Field>
        </div>

        <Field label="Description">
          <Textarea name="description" defaultValue={classRow?.description ?? ""} />
        </Field>

        <div className="flex gap-2 pt-2">
          <Button type="submit">{submitLabel ?? (classRow ? "Save changes" : "Create class")}</Button>
          <LinkButton href="/admin/classes" variant="secondary">
            Cancel
          </LinkButton>
        </div>
      </form>
    </Card>
  );
}
