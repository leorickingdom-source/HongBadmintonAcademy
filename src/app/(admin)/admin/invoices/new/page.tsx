import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { PageHeader, Section, Field, Input, Select, Textarea, Button, LinkButton } from "@/components/ui";
import { formatCurrency } from "@/lib/format";
import { dict } from "@/lib/i18n";
import { createInvoice } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewInvoicePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const me = await requireRole("admin");
  const L = dict(me.locale);
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
      <PageHeader
        title={L.ivf_new_title}
        action={<LinkButton href="/admin/invoices" variant="ghost">{L.ivf_all}</LinkButton>}
      />
      <Section title={L.ivf_details} className="max-w-xl">
        <form action={createInvoice} className="space-y-4">
          {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}

          <Field label={L.student_col} required hint={L.ivf_student_hint}>
            <Select name="student_id" required defaultValue="">
              <option value="" disabled>{L.ivf_select_student}</option>
              {(students ?? []).map((s: any) => (
                <option key={s.id} value={s.id}>
                  {s.full_name}
                  {s.parent?.full_name ? ` — ${s.parent.full_name}` : ""}
                </option>
              ))}
            </Select>
          </Field>

          <Field label={L.ivf_fee_plan}>
            <Select name="fee_plan_id" defaultValue="">
              <option value="">{L.none}</option>
              {(plans ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>
                  {p.name} — {formatCurrency(Number(p.amount), p.currency)}
                </option>
              ))}
            </Select>
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={L.fp_amount} required>
              <Input type="number" step="0.01" min="0" name="amount" required />
            </Field>
            <Field label={L.fpf_currency}>
              <Input name="currency" defaultValue="MYR" />
            </Field>
          </div>

          <Field label={L.ivf_due_date}>
            <Input type="date" name="due_date" />
          </Field>

          <Field label={L.cf_description}>
            <Textarea name="description" placeholder="e.g. Monthly fee — June 2026" />
          </Field>

          <div className="flex gap-2 pt-2">
            <Button type="submit">{L.ivf_create}</Button>
            <LinkButton href="/admin/invoices" variant="secondary">{L.inv_cancel_label}</LinkButton>
          </div>
        </form>
      </Section>
    </div>
  );
}
