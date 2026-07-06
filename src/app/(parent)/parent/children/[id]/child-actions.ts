"use server";

import { revalidatePath } from "next/cache";
import { requireParent } from "@/lib/parent-auth";
import { createAdminClient } from "@/lib/supabase/admin";

// Parent sets/clears the assigned coach for their own child. Service-role write
// scoped to the cookie-resolved parent; the coach must be an active coach.
export async function setChildCoach(input: {
  student_id: string;
  coach_id: string;
}): Promise<{ ok: boolean; error?: string }> {
  const me = await requireParent();
  if (!input?.student_id) return { ok: false, error: "missing" };

  const db = createAdminClient();
  const { data: child } = await db
    .from("students")
    .select("id, parent_id")
    .eq("id", input.student_id)
    .maybeSingle();
  if (!child || child.parent_id !== me.id) return { ok: false, error: "not your child" };

  const coachId = input.coach_id || null;
  if (coachId) {
    const { data: coach } = await db.from("profiles").select("id, role").eq("id", coachId).maybeSingle();
    if (!coach || coach.role !== "coach") return { ok: false, error: "not a coach" };
  }

  const { error } = await db.from("students").update({ coach_id: coachId }).eq("id", input.student_id);
  if (error) return { ok: false, error: error.message };
  revalidatePath(`/parent/children/${input.student_id}`);
  return { ok: true };
}
