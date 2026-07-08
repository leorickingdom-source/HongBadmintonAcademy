"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireSuperAdmin } from "@/lib/auth";
import { setWorkerPaused, setSendPolicy, setMonthlySchedule, set2faRequired, getAutoSessions, setAutoSessions } from "@/lib/settings";

// Pause/resume the WhatsApp drip worker. The desired new state arrives as a
// hidden "paused" field ("true"/"false"). Super-admin only.
export async function toggleWorker(formData: FormData) {
  await requireSuperAdmin();
  await setWorkerPaused(formData.get("paused") === "true");
  revalidatePath("/admin/settings");
}

// Require 2FA for every staff account (super-admin only). When on, staff without
// 2FA are forced to enrol before they can use the app.
export async function toggle2fa(formData: FormData) {
  await requireSuperAdmin();
  await set2faRequired(formData.get("required") === "true");
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

// Admin sets the worker's daily send schedule (window + cap + gap). Clamped to
// sane anti-ban bounds; end must be after start.
export async function saveSendPolicy(formData: FormData) {
  await requireSuperAdmin();
  const int = (k: string, d: number) => {
    const n = Math.round(Number(formData.get(k)));
    return Number.isFinite(n) ? n : d;
  };
  const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

  const windowStartHour = clamp(int("windowStartHour", 9), 0, 23);
  let windowEndHour = clamp(int("windowEndHour", 20), 1, 24);
  if (windowEndHour <= windowStartHour) windowEndHour = Math.min(24, windowStartHour + 1);
  const dailyCap = clamp(int("dailyCap", 10), 1, 50);
  const minGapMinutes = clamp(int("minGapMinutes", 10), 0, 240);

  await setSendPolicy({ windowStartHour, windowEndHour, dailyCap, minGapMinutes });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

// Toggle auto-session generation and/or set its rolling horizon. Either field
// may be omitted (two separate forms in the UI) — merge with current settings.
export async function saveAutoSessions(formData: FormData) {
  await requireSuperAdmin();
  const cur = await getAutoSessions();
  const enabledRaw = formData.get("enabled");
  const horizonRaw = formData.get("horizonDays");
  await setAutoSessions({
    enabled: enabledRaw != null ? enabledRaw === "true" : cur.enabled,
    horizonDays: horizonRaw != null ? Math.min(90, Math.max(7, Math.round(Number(horizonRaw)) || cur.horizonDays)) : cur.horizonDays,
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}

// Admin sets which day of the month invoices/reports go out + the due date.
// Days clamped to 1–28 so they always exist in every month.
export async function saveMonthlySchedule(formData: FormData) {
  await requireSuperAdmin();
  const day = (k: string, d: number) => {
    const n = Math.round(Number(formData.get(k)));
    return Number.isFinite(n) ? Math.min(28, Math.max(1, n)) : d;
  };
  await setMonthlySchedule({
    runDay: day("runDay", 1),
    dueDay: day("dueDay", 7),
  });
  revalidatePath("/admin/settings");
  redirect("/admin/settings?saved=1");
}
