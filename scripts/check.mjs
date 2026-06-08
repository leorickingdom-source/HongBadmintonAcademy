// Connectivity + schema check. Run: node --env-file=.env.local scripts/check.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const db = createClient(url, key, { auth: { persistSession: false } });

const { error, count } = await db
  .from("profiles")
  .select("*", { count: "exact", head: true });

if (error) {
  if (/relation|does not exist|schema cache/i.test(error.message)) {
    console.log("NEED_SCHEMA: tables not found — run supabase/_setup.sql in the SQL Editor.");
    console.log("detail:", error.message);
  } else {
    console.log("ERROR:", error.message);
  }
  process.exit(2);
}

console.log(`OK: schema present. profiles rows = ${count ?? 0}`);
