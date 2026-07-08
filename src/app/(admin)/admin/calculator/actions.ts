"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { resolveWriteBranch } from "@/lib/branch";

// Turn a calculator quote into a real unpaid invoice for one student. Branch is
// stamped authoritatively (branch-admins can only bill their own branch); the
// parent is copied from the student so it shows on their portal.
export async function createQuoteInvoice(input: {
  student_id: string;
  amount: number;
  description: string;
  due_date?: string | null;
  currency?: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await requireRole("admin");
  if (!input?.student_id) return { ok: false, error: "Pick a student." };
  const amount = Math.round(Number(input.amount) * 100) / 100;
  if (!(amount > 0)) return { ok: false, error: "Amount must be greater than 0." };

  const supabase = await createClient();
  const { data: student } = await supabase
    .from("students")
    .select("id, parent_id, branch_id")
    .eq("id", input.student_id)
    .maybeSingle();
  if (!student) return { ok: false, error: "Student not found." };

  const branch_id = resolveWriteBranch(me, (student as any).branch_id ?? null);
  const { error } = await supabase.from("invoices").insert({
    student_id: input.student_id,
    parent_id: (student as any).parent_id ?? null,
    branch_id,
    description: (input.description || "Fees (calculator)").slice(0, 200),
    amount,
    currency: input.currency || "MYR",
    status: "unpaid",
    due_date: input.due_date || null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/invoices");
  return { ok: true };
}
