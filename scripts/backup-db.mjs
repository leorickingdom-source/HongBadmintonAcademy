// Logical backup of all public tables to JSON (service role, read-only).
//   node --env-file=.env.local scripts/backup-db.mjs
// Output dir: $BACKUP_DIR, else ../HBA_backups (sibling of the repo).
// Table list comes from the DB (list_backup_tables), so it never drifts —
// the same source the daily backup cron uses (/api/cron/backup).
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const { data: list, error: listErr } = await db.rpc("list_backup_tables");
if (listErr) {
  console.error("list tables:", listErr.message);
  process.exit(1);
}
const tables = (list ?? []).map((t) => (typeof t === "string" ? t : Object.values(t)[0]));

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const baseDir = process.env.BACKUP_DIR || join(process.cwd(), "..", "HBA_backups");
const dir = join(baseDir, `db-${stamp}`);
mkdirSync(dir, { recursive: true });

const PAGE = 1000;
const counts = {};
for (const t of tables) {
  const rows = [];
  let err = null;
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db.from(t).select("*").range(from, from + PAGE - 1);
    if (error) {
      err = error.message;
      break;
    }
    rows.push(...(data ?? []));
    if (!data || data.length < PAGE) break;
  }
  if (err) {
    console.log(`  ${t}: ERROR ${err}`);
    counts[t] = `ERROR: ${err}`;
    continue;
  }
  writeFileSync(`${dir}/${t}.json`, JSON.stringify(rows, null, 2));
  counts[t] = rows.length;
  console.log(`  ${t}: ${rows.length} rows`);
}
writeFileSync(`${dir}/_counts.json`, JSON.stringify(counts, null, 2));
console.log(`\nDB backup (${tables.length} tables) ->`, dir);
