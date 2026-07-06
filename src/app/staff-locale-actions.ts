"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { normalizeLocale } from "@/lib/i18n";

// Staff (admin / super-admin / coach) language toggle. Supabase-authed, so the
// RLS client updates their own profile (profiles_update allows id = auth.uid()).
export async function toggleStaffLocale(formData: FormData) {
  const me = await requireRole(["admin", "coach"]);
  const locale = normalizeLocale(String(formData.get("locale")));
  const supabase = await createClient();
  await supabase.from("profiles").update({ locale }).eq("id", me.id);
  revalidatePath("/", "layout");
}
