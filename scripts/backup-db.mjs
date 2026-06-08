// Logical backup of all public tables to JSON (service role, read-only).
// node --env-file=.env.local scripts/backup-db.mjs
import { createClient } from "@supabase/supabase-js";
import { mkdirSync, writeFileSync } from "node:fs";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const tables = [
  "profiles", "students", "classes", "class_coaches", "class_schedules",
  "enrollments", "sessions", "attendance", "nfc_tap_events",
  "marking_schemes", "marking_criteria", "assessments", "assessment_scores",
  "session_notes", "fee_plans", "invoices", "payments", "scorecards",
  "messages", "reward_rules", "reward_ledger",
];

const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const dir = `D:/HBA_backups/db-${stamp}`;
mkdirSync(dir, { recursive: true });

const counts = {};
for (const t of tables) {
  const { data, error } = await db.from(t).select("*").range(0, 99999);
  if (error) {
    console.log(`  ${t}: ERROR ${error.message}`);
    counts[t] = `ERROR: ${error.message}`;
    continue;
  }
  writeFileSync(`${dir}/${t}.json`, JSON.stringify(data, null, 2));
  counts[t] = data?.length ?? 0;
  console.log(`  ${t}: ${data?.length ?? 0} rows`);
}
writeFileSync(`${dir}/_counts.json`, JSON.stringify(counts, null, 2));
console.log("\nDB backup ->", dir);
