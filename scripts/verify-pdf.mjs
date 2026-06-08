// Verify a generated score card PDF is a real PDF in storage.
// Run: node --env-file=.env.local scripts/verify-pdf.mjs
import { createClient } from "@supabase/supabase-js";

const db = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

const { data: folders, error: e1 } = await db.storage.from("scorecards").list("");
if (e1) { console.log("list error:", e1.message); process.exit(2); }
const folder = (folders ?? []).find((f) => f.id === null || f.name);
if (!folder) { console.log("no objects in scorecards bucket"); process.exit(2); }

const { data: files } = await db.storage.from("scorecards").list(folder.name);
const file = (files ?? [])[0];
if (!file) { console.log("no file in folder", folder.name); process.exit(2); }

const path = `${folder.name}/${file.name}`;
const { data: blob, error: e2 } = await db.storage.from("scorecards").download(path);
if (e2) { console.log("download error:", e2.message); process.exit(2); }

const buf = Buffer.from(await blob.arrayBuffer());
const magic = buf.subarray(0, 5).toString("latin1");
console.log(`path=${path}  bytes=${buf.length}  magic=${JSON.stringify(magic)}  valid=${magic === "%PDF-"}`);
