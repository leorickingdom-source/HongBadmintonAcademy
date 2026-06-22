"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireRole } from "@/lib/auth";
import { setWorkerPaused, setSendPolicy, setMonthlySchedule } from "@/lib/settings";

// Pause/resume the WhatsApp drip worker. The desired new state arrives as a
// hidden "paused" field ("true"/"false"). Admin-only.
export async function toggleWorker(formData: FormData) {
  await requireRole("admin");
  await setWorkerPaused(formData.get("paused") === "true");
  revalidatePath("/admin/settings");
}

// Admin sets the worker's daily send schedule (window + cap + gap). Clamped to
// sane anti-ban bounds; end must be after start.
export async function saveSendPolicy(formData: FormData) {
  await requireRole("admin");
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

// Admin sets which day of the month invoices/reports go out + the due date.
// Days clamped to 1–28 so they always exist in every month.
export async function saveMonthlySchedule(formData: FormData) {
  await requireRole("admin");
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
