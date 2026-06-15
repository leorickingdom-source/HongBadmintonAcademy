"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth";
import { setWorkerPaused, setFeeRemindersPaused } from "@/lib/settings";

const schema = z.object({
  full_name: z.string().trim().min(1, "Name is required"),
  phone: z.string().trim().optional().transform((v) => (v ? v : null)),
});

// Update the currently signed-in user's own profile (RLS allows id = auth.uid()).
export async function updateOwnProfile(formData: FormData) {
  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    redirect(`/admin/settings?error=${encodeURIComponent(parsed.error.issues[0].message)}`);
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { error } = await supabase.from("profiles").update(parsed.data).eq("id", user.id);
  if (error) redirect(`/admin/settings?error=${encodeURIComponent(error.message)}`);

  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

// Pause/resume the WhatsApp drip worker. The desired new state arrives as a
// hidden "paused" field ("true"/"false"). Admin-only.
export async function toggleWorker(formData: FormData) {
  await requireRole("admin");
  await setWorkerPaused(formData.get("paused") === "true");
  revalidatePath("/admin/settings");
}

// Park/resume the auto fee reminders only (worker keeps sending everything else).
export async function toggleFeeReminders(formData: FormData) {
  await requireRole("admin");
  await setFeeRemindersPaused(formData.get("paused") === "true");
  revalidatePath("/admin/settings");
}
