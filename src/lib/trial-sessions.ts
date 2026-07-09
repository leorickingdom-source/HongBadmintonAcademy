import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatTime } from "@/lib/format";
import { levelName } from "@/lib/training";

// Public read of upcoming scheduled sessions for the /trial picker. Service-role
// (branch/class/session times aren't sensitive; the picker is exposed on the
// public sign-up form). Horizon = 14 days from today (MYT); status='scheduled';
// caps at 40 rows so a busy academy still fits in one <select>.

export type PublicTrialSession = {
  id: string;
  session_date: string;
  start_time: string;
  end_time: string | null;
  class_id: string;
  class_name: string;
  level: number | null;
  branch_id: string | null;
  branch_name: string | null;
  label: string;
};

const MYT_MS = 8 * 60 * 60 * 1000;

function mytDateStr(offsetDays: number): string {
  return new Date(Date.now() + MYT_MS + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

export async function listPublicTrialSessions(): Promise<PublicTrialSession[]> {
  const db = createAdminClient();
  const today = mytDateStr(0);
  const horizonEnd = mytDateStr(14);

  const { data } = await db
    .from("sessions")
    .select(
      "id, session_date, start_time, end_time, class_id, branch_id, status, classes(name, level, is_active), branches(name, is_active)",
    )
    .eq("status", "scheduled")
    .gte("session_date", today)
    .lte("session_date", horizonEnd)
    .order("session_date", { ascending: true })
    .order("start_time", { ascending: true })
    .limit(80);

  const rows = (data ?? []) as any[];
  const out: PublicTrialSession[] = [];
  for (const r of rows) {
    const cls = r.classes ?? {};
    if (cls.is_active === false) continue;
    const br = r.branches ?? null;
    if (br && br.is_active === false) continue;

    const dateBit = formatDate(r.session_date);
    const timeBit = formatTime(r.start_time);
    const branchBit = br?.name ?? null;
    const lvlNum = cls.level != null && !Number.isNaN(Number(cls.level)) ? Number(cls.level) : null;
    const lvlNamed = lvlNum ? levelName(lvlNum) : null;
    const levelBit = lvlNamed && lvlNamed !== "—" ? lvlNamed : null;
    const label = [dateBit, timeBit, branchBit, cls.name, levelBit].filter(Boolean).join(" · ");

    out.push({
      id: r.id,
      session_date: r.session_date,
      start_time: r.start_time,
      end_time: r.end_time ?? null,
      class_id: r.class_id,
      class_name: cls.name ?? "Class",
      level: cls.level ?? null,
      branch_id: r.branch_id ?? null,
      branch_name: branchBit,
      label,
    });
    if (out.length >= 40) break;
  }
  return out;
}

// Session summary the trial action stamps onto trial_leads.preferred_slot so
// the admin card + admin lead list stay human-readable without re-joining.
export function summariseSession(s: PublicTrialSession): string {
  return s.label;
}
