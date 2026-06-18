import "server-only";

// Append a rank-change row to rank_events. No-op when the effective rank didn't
// actually change. Always called with the service-role client (rank_events has
// RLS on with no policies — see migration 0024) from the coach/admin rank
// actions. Never throws into the caller: a failed audit insert must not block
// the rank change itself.
export async function recordRankChange(
  db: any,
  opts: { student_id: string; from: string | null; to: string | null; changed_by?: string | null },
): Promise<void> {
  if (opts.from === opts.to) return;
  try {
    await db.from("rank_events").insert({
      student_id: opts.student_id,
      from_rank: opts.from,
      to_rank: opts.to,
      changed_by: opts.changed_by ?? null,
    });
  } catch {
    /* audit-only; ignore */
  }
}
