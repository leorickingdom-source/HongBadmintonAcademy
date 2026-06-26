"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireRole } from "@/lib/auth";
import { recordRankChange } from "@/lib/rank-history";
import { createNotifications, notifyAdmins } from "@/lib/notifications";
import { pushToUsers } from "@/lib/push";
import { RANK_ORDER } from "@/lib/ranks";
import {
  examSpecFor, bandFor, defaultDecision, levelToRank, levelName,
  examWindowLabel, type Decision, type SectionKey,
} from "@/lib/training";

function err(studentId: string, message: string): never {
  redirect(`/coach/exams/${studentId}?error=${encodeURIComponent(message)}`);
}

const DECISIONS: Decision[] = ["promote", "maintain", "reassess"];

// Coach: record a graded promotion exam. The RLS insert policy enforces the
// coach teaches this student — that insert is the authorization gate for the
// service-role promotion writes below.
export async function createLevelExam(formData: FormData) {
  const me = await requireRole("coach");
  const student_id = String(formData.get("student_id"));
  const from_level = Number(formData.get("from_level"));
  const spec = examSpecFor(from_level);
  if (!spec) err(student_id, "No exam defined for this level");

  // Build per-item snapshot + section subtotals from the posted scores.
  const sectionTotals: Record<SectionKey, number> = { technical: 0, footwork: 0, tactical: 0, physical: 0 };
  const scoresSnapshot: Record<string, unknown> = {};
  for (const sec of spec.sections) {
    const items = sec.items.map((it, i) => {
      const raw = Number(formData.get(`s_${sec.key}_${i}`) ?? 0);
      const score = Math.max(0, Math.min(it.max, Number.isNaN(raw) ? 0 : raw));
      return { label: it.label, score, max: it.max };
    });
    const subtotal = items.reduce((a, b) => a + b.score, 0);
    sectionTotals[sec.key] = subtotal;
    scoresSnapshot[sec.key] = { label: sec.label, max: sec.max, subtotal, items };
  }
  const total = (Object.values(sectionTotals) as number[]).reduce((a, b) => a + b, 0);
  const band = bandFor(total).key;

  const rawDecision = String(formData.get("decision") ?? "");
  const decision: Decision = DECISIONS.includes(rawDecision as Decision)
    ? (rawDecision as Decision)
    : defaultDecision(total, !!spec.review);

  const comment = (formData.get("comment") as string)?.trim() || null;
  const next_target = (formData.get("next_target") as string)?.trim() || null;

  const supabase = await createClient();
  const { error } = await supabase.from("level_exams").insert({
    student_id,
    coach_id: me.id,
    from_level,
    to_level: spec.toLevel,
    window_label: examWindowLabel(),
    technical: sectionTotals.technical,
    footwork: sectionTotals.footwork,
    tactical: sectionTotals.tactical,
    physical: sectionTotals.physical,
    total,
    band,
    decision,
    scores: scoresSnapshot,
    coach_comment: comment,
    next_target,
  });
  if (error) err(student_id, error.message);

  // Promote only when the coach decided so AND a real next level exists (not the
  // L6 Elite review). Service-role: bump level, sync coarse rank upward, notify.
  if (decision === "promote" && !spec.review && spec.toLevel <= 6) {
    const db = createAdminClient();
    const { data: s } = await db
      .from("students")
      .select("full_name, rank, parent_id")
      .eq("id", student_id)
      .maybeSingle();
    const prevRank = (s as { rank?: string | null } | null)?.rank ?? null;
    const newRank = levelToRank(spec.toLevel);
    const ord = (r: string | null) => (r ? RANK_ORDER[r] ?? 0 : 0);

    const update: Record<string, unknown> = { level: spec.toLevel };
    if (newRank && ord(newRank) > ord(prevRank)) update.rank = newRank;
    await db.from("students").update(update).eq("id", student_id);
    if (update.rank) await recordRankChange(db, { student_id, from: prevRank, to: newRank });

    const name = (s as { full_name?: string } | null)?.full_name ?? "Your child";
    const parentId = (s as { parent_id?: string | null } | null)?.parent_id ?? null;
    const body = `${name} passed the Level ${from_level} exam (${total}/100) — now Level ${spec.toLevel}: ${levelName(spec.toLevel)}.`;
    await pushToUsers([parentId], { title: "🎉 Level up!", body, url: "/parent", tag: "level" });
    await createNotifications([parentId], { type: "level", title: "🎉 Level up!", body, url: "/parent" });
    await notifyAdmins({
      type: "level",
      title: "Student promoted",
      body: `${name} → Level ${spec.toLevel} (${levelName(spec.toLevel)})`,
      url: "/admin/exams",
    });
  }

  revalidatePath(`/coach/exams/${student_id}`);
  revalidatePath("/coach/exams");
  revalidatePath("/admin/exams");
  redirect(`/coach/exams/${student_id}?saved=1`);
}
