"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function err(studentId: string, message: string): never {
  redirect(`/coach/marking/${studentId}?error=${encodeURIComponent(message)}`);
}

export async function createAssessment(formData: FormData) {
  const student_id = String(formData.get("student_id"));
  const scheme_id = String(formData.get("scheme_id"));
  const comment = (formData.get("comment") as string)?.trim() || null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) err(student_id, "Not signed in");

  const { data: criteria } = await supabase
    .from("marking_criteria")
    .select("*")
    .eq("scheme_id", scheme_id)
    .order("sort_order");

  if (!criteria || criteria.length === 0) err(student_id, "Scheme has no criteria");

  // Compute weighted overall (% of max).
  let weightedSum = 0;
  let weightTotal = 0;
  const scoreRows = criteria.map((c: any) => {
    const raw = Number(formData.get(`score_${c.id}`) ?? 0);
    const score = Number.isNaN(raw) ? 0 : raw;
    const max = Number(c.max_score) || 1;
    const weight = Number(c.weight) || 1;
    weightedSum += (score / max) * weight;
    weightTotal += weight;
    return {
      criterion_id: c.id,
      criterion_name: c.name,
      weight,
      max_score: max,
      score,
    };
  });
  const overall = weightTotal ? Math.round((weightedSum / weightTotal) * 1000) / 10 : null;

  const { data: assessment, error } = await supabase
    .from("assessments")
    .insert({
      student_id,
      coach_id: user.id,
      scheme_id,
      comment,
      overall_score: overall,
    })
    .select("id")
    .single();
  if (error) err(student_id, error.message);

  const { error: scoreErr } = await supabase
    .from("assessment_scores")
    .insert(scoreRows.map((r) => ({ ...r, assessment_id: assessment!.id })));
  if (scoreErr) err(student_id, scoreErr.message);

  revalidatePath(`/coach/marking/${student_id}`);
  redirect(`/coach/marking/${student_id}?saved=1`);
}

export async function addNote(formData: FormData) {
  const student_id = String(formData.get("student_id"));
  const note = (formData.get("note") as string)?.trim();
  if (!note) err(student_id, "Note is empty");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) err(student_id, "Not signed in");

  const { error } = await supabase
    .from("session_notes")
    .insert({ student_id, coach_id: user.id, note });
  if (error) err(student_id, error.message);

  revalidatePath(`/coach/marking/${student_id}`);
}
