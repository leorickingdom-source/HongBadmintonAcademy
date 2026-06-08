import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Field, Input, Select, Textarea, Button, LinkButton } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { createInvoice } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const supabase = await createClient();

  const [{ data: students }, { data: plans }] = await Promise.all([
    supabase
      .from("students")
      .select("id, full_name, parent:profiles!students_parent_id_fkey(full_name)")
      .eq("status", "active")
      .order("full_name"),
    supabase.from("fee_plans").select("*").eq("is_active", true).order("name"),
  ]);

  return (
    <div>
      <PageHeader title="New invoice" />
      <Card className="max-w-xl p-6">
        <form action={createInvoice} className="space-y-4">
          {error && <p className="rounded-md bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <Field label="Student" required hint="Parent is linked automatically from the student.">
            <Select name="student_id" required defaultValue="">
              <option value="" disabled>— select student —</option>
              {(students ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {s.parent?.full_name ? ` — ${s.parent.full_name}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Fee plan (optional)">
            <Select name="fee_plan_id" defaultValue="">
              <option value="">— none —</option>
              {(plans ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatCurrency(Number(p.amount), p.currency)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount" required>
              <Input type="number" step="0.01" min="0" name="amount" required />
            </Field>
            <Field label="Currency">
              <Input name="currency" defaultValue="MYR" />
            </Field>
          </div>

          <Field label="Due date">
            <Input type="date" name="due_date" />
          </Field>

          <Field label="Description">
            <Textarea name="description" placeholder="e.g. Monthly fee — June 2026" />
          </Field>

          <div className="flex gap-2 pt-2">
            <Button type="submit">Create invoice</Button>
            <LinkButton href="/admin/invoices" variant="secondary">Cancel</LinkButton>
          </div>
        </form>
      </Card>
    </div>
  );
}
