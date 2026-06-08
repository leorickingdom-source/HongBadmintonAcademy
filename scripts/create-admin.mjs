// Bootstrap an admin account on a hosted Supabase project (no seed data).
//
//   node --env-file=.env.local scripts/create-admin.mjs <email> <password> "<Full Name>"
//
// Requires NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in the env.
import { createClient } from "@supabase/supabase-js";

const [email, password, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ") || "Academy Admin";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
if (!email || !password) {
  console.error('Usage: node --env-file=.env.local scripts/create-admin.mjs <email> <password> "<Full Name>"');
  process.exit(1);
}

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data, error } = await supabase.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: { full_name: fullName, role: "admin" },
});

if (error) {
  console.error("Failed:", error.message);
  process.exit(1);
}
console.log(`✓ Admin created: ${email} (id ${data.user?.id})`);
