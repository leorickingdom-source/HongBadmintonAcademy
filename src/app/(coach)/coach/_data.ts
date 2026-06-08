// Helper: the set of class ids a coach is responsible for (primary or assigned).
export async function coachClassIds(supabase: any, coachId: string): Promise<string[]> {
  const [{ data: cc }, { data: cl }] = await Promise.all([
    supabase.from("class_coaches").select("class_id").eq("coach_id", coachId),
    supabase.from("classes").select("id").eq("coach_id", coachId),
  ]);
  const ids = new Set<string>();
  (cc ?? []).forEach((r: any) => ids.add(r.class_id));
  (cl ?? []).forEach((r: any) => ids.add(r.id));
  return [...ids];
}
