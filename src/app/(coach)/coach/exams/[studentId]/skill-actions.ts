"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";

// Toggle a curriculum skill as mastered for a student. Row present = mastered;
// unticking deletes it. RLS (coach_of_student) authorizes the write.
export async function setSkill(input: {
  student_id: string;
  level: number;
  skill_key: string;
  on: boolean;
}): Promise<{ ok: boolean }> {
  const me = await requireRole("coach");
  if (!input?.student_id || !input?.skill_key || !Number.isFinite(input.level)) return { ok: false };

  const supabase = await createClient();
  if (input.on) {
    const { error } = await supabase.from("skill_mastery").upsert(
      {
        student_id: input.student_id,
        level: input.level,
        skill_key: input.skill_key,
        coach_id: me.id,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "student_id,level,skill_key" },
    );
    if (error) return { ok: false };
  } else {
    const { error } = await supabase
      .from("skill_mastery")
      .delete()
      .eq("student_id", input.student_id)
      .eq("level", input.level)
      .eq("skill_key", input.skill_key);
    if (error) return { ok: false };
  }
  revalidatePath(`/coach/exams/${input.student_id}`);
  return { ok: true };
}
