"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordRankChange } from "@/lib/rank-history";
import { sendRankUpNotice } from "@/lib/reminders";
import { levelName } from "@/lib/training";

// Admin acts on a coach's assessment: promote the student to the exam's target
// level. Only admin can do this (coaches just mark). Sets the level exactly to
// the exam's to_level, logs it, and notifies the parent of the level-up.
export async function promoteFromExam(formData: FormData) {
  await requireRole("admin");
  const examId = String(formData.get("exam_id"));
  const db = createAdminClient();

  const { data: ex } = await db
    .from("level_exams")
    .select("student_id, to_level")
    .eq("id", examId)
    .maybeSingle();
  if (!ex) redirect(`/admin/exams?error=${encodeURIComponent("Assessment not found.")}`);

  const toLevel = Number((ex as { to_level: number }).to_level);
  const studentId = (ex as { student_id: string }).student_id;
  if (toLevel > 6) redirect(`/admin/exams?error=${encodeURIComponent("Elite review has no promotion.")}`);

  const { data: s } = await db.from("students").select("level").eq("id", studentId).maybeSingle();
  const cur = Number((s as { level?: number } | null)?.level ?? 1);
  if (cur >= toLevel) {
    revalidatePath("/admin/exams");
    redirect("/admin/exams?promoted=already");
  }

  await db.from("students").update({ level: toLevel }).eq("id", studentId);
  await recordRankChange(db, { student_id: studentId, from: levelName(cur), to: levelName(toLevel) });
  try { await sendRankUpNotice(studentId, `Level ${toLevel} · ${levelName(toLevel)}`); } catch { /* never block the promotion */ }

  revalidatePath("/admin/exams");
  revalidatePath(`/admin/students/${studentId}`);
  redirect("/admin/exams?promoted=1");
}
