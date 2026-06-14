import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "backups";
const PAGE = 1000; // PostgREST default cap; we page past it.

// Malaysia-time YYYY-MM-DD for the filename (the cron fires in UTC).
function mytDateLabel(now: Date): string {
  return new Date(now.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Logical snapshot of every public table into one JSON file in the private
// `backups` bucket. The table list comes from list_backup_tables() (migration
// 0013) so new tables are captured automatically. Caller must pass the
// service-role client — it reads every row and bypasses RLS.
export async function runDatabaseBackup(
  db: SupabaseClient,
  now: Date = new Date(),
): Promise<{ tables: number; rows: number; path: string }> {
  const { data: list, error: listErr } = await db.rpc("list_backup_tables");
  if (listErr) throw new Error(`list tables: ${listErr.message}`);
  const tables: string[] = (list ?? []).map((t: any) =>
    typeof t === "string" ? t : (Object.values(t)[0] as string),
  );

  const data: Record<string, unknown[]> = {};
  let rows = 0;
  for (const table of tables) {
    const all: unknown[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await db.from(table).select("*").range(from, from + PAGE - 1);
      if (error) throw new Error(`backup ${table}: ${error.message}`);
      all.push(...(page ?? []));
      if (!page || page.length < PAGE) break;
    }
    data[table] = all;
    rows += all.length;
  }

  const payload = {
    generated_at: now.toISOString(),
    table_count: tables.length,
    row_count: rows,
    tables,
    data,
  };

  const path = `daily/${mytDateLabel(now)}.json`;
  const { error: upErr } = await db.storage
    .from(BUCKET)
    .upload(path, Buffer.from(JSON.stringify(payload)), {
      contentType: "application/json",
      upsert: true,
    });
  if (upErr) throw new Error(`upload: ${upErr.message}`);

  return { tables: tables.length, rows, path };
}
