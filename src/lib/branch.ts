import "server-only";
import { cookies } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import type { Branch, Profile } from "@/lib/types";

export const BRANCH_VIEW_COOKIE = "hba_branch";

// An admin's chosen "viewing" branch — an app-layer convenience that narrows
// list/dashboard reads to one branch. Returns a branch id, or null for "all
// branches". Every admin now sees all branches (the branch-admin wall is gone),
// so this focus switcher is available to all of them. NEVER a security boundary
// — RLS is — so a missed page just shows all branches, never hides one.
export async function getViewBranchId(me: Profile): Promise<string | null> {
  if (me.role !== "admin" && me.role !== "super_admin") return null;
  const v = (await cookies()).get(BRANCH_VIEW_COOKIE)?.value;
  return v && v !== "all" ? v : null;
}

// Active branches for selectors/filters. Service-role read (branch names aren't
// sensitive); callers that render this are already admin-gated.
export async function listBranches(activeOnly = true): Promise<Branch[]> {
  const db = createAdminClient();
  let q = db.from("branches").select("*").order("name");
  if (activeOnly) q = q.eq("is_active", true);
  const { data } = await q;
  return (data as Branch[]) ?? [];
}

// Any admin may now choose which branch a record belongs to (they manage all
// branches). Non-admins never reach these forms.
export function canChooseBranch(me: Profile): boolean {
  return me.role === "admin" || me.role === "super_admin";
}

// The authoritative branch_id to stamp on a write by `me`. Any admin may pick a
// branch; falls back to their own home branch when none is chosen.
export function resolveWriteBranch(me: Profile, chosen?: string | null): string | null {
  if (me.role === "admin" || me.role === "super_admin") return (chosen && chosen.trim()) || me.branch_id || null;
  return me.branch_id ?? null;
}
