import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import {
  PageHeader, Card, Field, Input, Textarea, Button, LinkButton,
  Table, Th, Td, EmptyState,
} from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { updateScheme, addCriterion, deleteCriterion } from "../actions";

export const dynamic = "force-dynamic";

export default async function ManageSchemePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: scheme }, { data: criteria }] = await Promise.all([
    supabase.from("marking_schemes").select("*").eq("id", id).maybeSingle(),
    supabase.from("marking_criteria").select("*").eq("scheme_id", id).order("sort_order"),
  ]);
  if (!scheme) notFound();

  return (
    <div className="space-y-8">
      <PageHeader title="Manage scheme" description={scheme.name} />
      {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

      <Card className="max-w-xl p-6">
        <h2 className="mb-4 font-semibold text-slate-900">Scheme details</h2>
        <form action={updateScheme} className="space-y-4">
          <input type="hidden" name="id" value={scheme.id} />
          <Field label="Name" required>
            <Input name="name" defaultValue={scheme.name} required />
          </Field>
          <Field label="Description">
            <Textarea name="description" defaultValue={scheme.description ?? ""} />
          </Field>
          <div className="flex gap-2">
            <Button type="submit">Save</Button>
            <LinkButton href="/admin/marking-schemes" variant="secondary">
              Back
            </LinkButton>
          </div>
        </form>
      </Card>

      <div>
        <h2 className="mb-3 font-semibold text-slate-900">Criteria</h2>
        {criteria && criteria.length > 0 ? (
          <Table>
            <thead>
              <tr>
                <Th>Order</Th>
                <Th>Criterion</Th>
                <Th>Weight</Th>
                <Th>Max</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {criteria.map((c: any) => (
                <tr key={c.id}>
                  <Td>{c.sort_order}</Td>
                  <Td className="font-medium text-slate-900">{c.name}</Td>
                  <Td>{Number(c.weight)}</Td>
                  <Td>{Number(c.max_score)}</Td>
                  <Td className="text-right">
                    <form action={deleteCriterion}>
                      <input type="hidden" name="id" value={c.id} />
                      <input type="hidden" name="scheme_id" value={scheme.id} />
                      <ConfirmButton label="Remove" confirmText={`Remove "${c.name}"?`} />
                    </form>
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        ) : (
          <EmptyState message="No criteria yet — add the client's marking criteria below." />
        )}

        <Card className="mt-4 max-w-2xl p-6">
          <h3 className="mb-4 font-medium text-slate-800">Add criterion</h3>
          <form action={addCriterion} className="grid gap-4 sm:grid-cols-2">
            <input type="hidden" name="scheme_id" value={scheme.id} />
            <Field label="Name" required>
              <Input name="name" required placeholder="e.g. Footwork" />
            </Field>
            <Field label="Sort order">
              <Input type="number" name="sort_order" defaultValue={(criteria?.length ?? 0) + 1} />
            </Field>
            <Field label="Weight">
              <Input type="number" step="0.1" name="weight" defaultValue={1} />
            </Field>
            <Field label="Max score">
              <Input type="number" step="0.1" name="max_score" defaultValue={10} />
            </Field>
            <div className="sm:col-span-2">
              <Button type="submit">Add criterion</Button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}
