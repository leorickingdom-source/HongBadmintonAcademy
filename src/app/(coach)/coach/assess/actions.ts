"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";

export type Dim = "fitness" | "skills" | "attitude";
const DIMS: Dim[] = ["fitness", "skills", "attitude"];

// Auto-save one dimension score for one student. RLS restricts writes to the
// coach's own students (or admin).
export async function setMonthlyScore(input: {
  student_id: string;
  class_id: string;
  period_month: string; // YYYY-MM-01
  dim: Dim;
  value: number;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await requireRole(["coach", "admin"]);
  if (!input?.student_id || !input?.period_month) return { ok: false, error: "missing" };
  if (!DIMS.includes(input.dim)) return { ok: false, error: "bad dim" };
  if (!Number.isInteger(input.value) || input.value < 1 || input.value > 5) {
    return { ok: false, error: "bad value" };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("monthly_assessments").upsert(
    {
      student_id: input.student_id,
      class_id: input.class_id || null,
      coach_id: me.id,
      period_month: input.period_month,
      [input.dim]: input.value,
    },
    { onConflict: "student_id,period_month" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/assess");
  return { ok: true };
}

export async function setMonthlyComment(input: {
  student_id: string;
  class_id: string;
  period_month: string;
  comment: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await requireRole(["coach", "admin"]);
  if (!input?.student_id || !input?.period_month) return { ok: false, error: "missing" };
  const comment = (input.comment ?? "").trim().slice(0, 500) || null;

  const supabase = await createClient();
  const { error } = await supabase.from("monthly_assessments").upsert(
    {
      student_id: input.student_id,
      class_id: input.class_id || null,
      coach_id: me.id,
      period_month: input.period_month,
      comment,
    },
    { onConflict: "student_id,period_month" },
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/coach/assess");
  return { ok: true };
}
