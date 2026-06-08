import { PageHeader, Card, Field, Input, Textarea, Button, LinkButton } from "@/components/ui";
import { createScheme } from "../actions";

export default async function NewSchemePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <div>
      <PageHeader title="New marking scheme" />
      <Card className="max-w-xl p-6">
        <form action={createScheme} className="space-y-4">
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}
          <Field label="Scheme name" required>
            <Input name="name" required placeholder="e.g. Junior Skills v1" />
          </Field>
          <Field label="Description">
            <Textarea name="description" />
          </Field>
          <div className="flex gap-2 pt-2">
            <Button type="submit">Create &amp; add criteria</Button>
            <LinkButton href="/admin/marking-schemes" variant="secondary">
              Cancel
            </LinkButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
