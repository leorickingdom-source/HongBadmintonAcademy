"use server";

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { trialLeadSchema } from "@/lib/validation";
import { notifyAdmins } from "@/lib/notifications";
import { getPublicLocale } from "@/lib/public-locale";
import { formatDate, formatTime } from "@/lib/format";
import { levelName } from "@/lib/training";
import { APP_NAME } from "@/lib/constants";

function err(message: string): never {
  redirect(`/trial?error=${encodeURIComponent(message)}`);
}

const MYT_MS = 8 * 60 * 60 * 1000;
function mytDateStr(offsetDays: number): string {
  return new Date(Date.now() + MYT_MS + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

// Public "book a free trial" → drop a lead in status 'new' and ping the admins.
// No login, no payment, no student/parent row — a lead is created here and an
// admin converts it later (see /admin/leads). Writes use the service-role
// client because there is no anon RLS policy on trial_leads.
//
// P2b (2026-07-09): parents now pick a REAL upcoming session on the form. When
// they do, we derive branch_id from the session, stamp the human-readable slot
// label as preferred_slot, jump the lead straight to status 'trial_booked', and
// queue a WhatsApp confirmation to the parent's phone (drip via the worker so
// the send stays under Meta's ban radar). Free-form time text is gone.
export async function requestTrial(formData: FormData) {
  // Honeypot: real users never fill the hidden "company" field; bots do. Drop
  // silently (pretend success) so scripted spam never creates a lead.
  if (String(formData.get("company") ?? "").trim()) redirect("/trial/thanks");

  const parsed = trialLeadSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) err(parsed.error.issues[0].message);
  const { child_name, child_dob, experience, parent_name, phone, email, session_id } = parsed.data;

  const db = createAdminClient();
  const locale = await getPublicLocale();

  // Re-validate the posted session_id server-side — must be a scheduled,
  // in-horizon session for an active class/branch. Never trust the raw id.
  let branch: string | null = null;
  let preferredSlot: string | null = null;
  let preferredSessionId: string | null = null;
  let sessionRow: {
    id: string;
    session_date: string;
    start_time: string;
    class_name: string;
    level: number | null;
    branch_name: string | null;
  } | null = null;

  if (session_id) {
    const { data: s } = await db
      .from("sessions")
      .select(
        "id, session_date, start_time, branch_id, class_id, status, classes(name, level, is_active), branches(name, is_active)",
      )
      .eq("id", session_id)
      .maybeSingle();
    const cls = (s as any)?.classes ?? null;
    const br = (s as any)?.branches ?? null;
    const today = mytDateStr(0);
    const horizonEnd = mytDateStr(14);
    const inWindow = s?.session_date && s.session_date >= today && s.session_date <= horizonEnd;
    if (
      s &&
      (s as any).status === "scheduled" &&
      cls?.is_active !== false &&
      (br == null || br.is_active !== false) &&
      inWindow
    ) {
      branch = (s as any).branch_id ?? null;
      preferredSessionId = s.id;
      const dateBit = formatDate(s.session_date);
      const timeBit = formatTime(s.start_time);
      const lvlNum = cls?.level != null && !Number.isNaN(Number(cls.level)) ? Number(cls.level) : null;
      const lvlNamed = lvlNum ? levelName(lvlNum) : null;
      const levelBit = lvlNamed && lvlNamed !== "—" ? lvlNamed : null;
      preferredSlot = [dateBit, timeBit, br?.name, cls?.name, levelBit].filter(Boolean).join(" · ");
      sessionRow = {
        id: s.id,
        session_date: s.session_date,
        start_time: s.start_time,
        class_name: cls?.name ?? "Class",
        level: cls?.level ?? null,
        branch_name: br?.name ?? null,
      };
    }
  }

  const status = preferredSessionId ? "trial_booked" : "new";

  const { data: leadRow, error: insErr } = await db
    .from("trial_leads")
    .insert({
      child_name,
      child_dob,
      experience,
      parent_name,
      phone,
      email,
      branch_id: branch,
      preferred_slot: preferredSlot,
      preferred_session_id: preferredSessionId,
      status,
      source: "web",
      consent: true,
      consent_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (insErr || !leadRow) err("Sorry — we couldn't submit your request. Please try again.");

  // Ping the admins' notification bell. Best-effort: never block the parent's
  // submit on it (notifyAdmins itself swallows insert failures).
  try {
    await notifyAdmins({
      type: "trial_lead",
      title: preferredSessionId ? "Trial booked" : "New trial request",
      body: preferredSlot
        ? `${child_name} — ${parent_name} · ${preferredSlot}`
        : `${child_name} — ${parent_name} (${phone})`,
      url: "/admin/leads",
    });
  } catch {
    // ignore
  }

  // Auto WhatsApp confirmation to the parent. Enqueued (drip) so it obeys the
  // worker's send window + daily cap; if no session was picked, we still send a
  // "we'll be in touch" ack. Bilingual, sourced from the visitor's public locale.
  try {
    const body = buildTrialConfirmBody({
      locale,
      parentName: parent_name,
      childName: child_name,
      session: sessionRow,
    });
    await db.from("message_queue").insert({
      kind: `trial_confirm:${leadRow.id}`,
      recipient_phone: phone,
      body,
    });
  } catch {
    // never block submit on messaging
  }

  redirect(preferredSessionId ? `/trial/thanks?sid=${preferredSessionId}` : "/trial/thanks");
}

function buildTrialConfirmBody(opts: {
  locale: "en" | "zh";
  parentName: string;
  childName: string;
  session: {
    session_date: string;
    start_time: string;
    class_name: string;
    level: number | null;
    branch_name: string | null;
  } | null;
}): string {
  const { locale, parentName, childName, session } = opts;
  if (locale === "zh") {
    if (session) {
      const when = `${formatDate(session.session_date)} · ${formatTime(session.start_time)}`;
      const where = session.branch_name ?? "";
      return (
        `🏸 ${APP_NAME}\n` +
        `${parentName} 您好，我们已收到 ${childName} 的免费试课申请。\n` +
        `已为您预约：${when}${where ? ` · ${where}` : ""}（${session.class_name}）。\n` +
        `课前 24 小时会再确认。如需改期请回复此讯息。`
      );
    }
    return (
      `🏸 ${APP_NAME}\n` +
      `${parentName} 您好，我们已收到 ${childName} 的免费试课申请。\n` +
      `我们的团队会尽快回复以安排合适时间。`
    );
  }
  if (session) {
    const when = `${formatDate(session.session_date)} · ${formatTime(session.start_time)}`;
    const where = session.branch_name ?? "";
    return (
      `🏸 ${APP_NAME}\n` +
      `Hi ${parentName}, we've received ${childName}'s free-trial request.\n` +
      `You're booked for: ${when}${where ? ` · ${where}` : ""} (${session.class_name}).\n` +
      `We'll confirm again 24h before. Reply to this message to reschedule.`
    );
  }
  return (
    `🏸 ${APP_NAME}\n` +
    `Hi ${parentName}, thanks — we've received ${childName}'s free-trial request. ` +
    `Our team will reach out shortly to arrange a suitable time.`
  );
}
