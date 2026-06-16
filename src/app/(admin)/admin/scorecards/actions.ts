"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { generateScorecardsCore } from "@/lib/scorecards";
import { upsertCommunityMonthlyNotice } from "@/lib/reminders";
import { getBaseUrl } from "@/lib/url";

// Manual "Generate this month" button: runs the report for the current month as
// the logged-in admin (RLS client for reads/writes, service-role for storage).
// The same core runs headless from /api/cron/generate-scorecards each month.
// Redirects back with a summary so the button gives visible feedback.
export async function generateScorecards() {
  const supabase = await createClient();
  const admin = createAdminClient();
  const { generated } = await generateScorecardsCore(supabase, admin);
  // Seed/refresh the monthly Community post (reports-only until invoices exist) — send now.
  const notice = await upsertCommunityMonthlyNotice(await getBaseUrl(), true);
  revalidatePath("/admin/scorecards");
  redirect(`/admin/scorecards?generated=${generated}&notice=${notice.posted}`);
}

// WhatsApp click-to-chat: the admin opened wa.me with the message; record it in
// the log and mark the report sent. (No API/verification needed.)
export async function logScorecardSend(formData: FormData) {
  const scorecard_id = String(formData.get("scorecard_id"));
  const recipient_phone = String(formData.get("recipient_phone") ?? "");
  const recipient_profile_id = (formData.get("recipient_profile_id") as string) || null;
  const body = String(formData.get("body") ?? "");

  const supabase = await createClient();
  await supabase.from("messages").insert({
    type: "scorecard",
    recipient_profile_id,
    recipient_phone,
    body,
    scorecard_id,
    provider: "wa_click",
    status: "sent",
    sent_at: new Date().toISOString(),
  });
  await supabase.from("scorecards").update({ status: "sent" }).eq("id", scorecard_id);
  revalidatePath("/admin/scorecards");
}
