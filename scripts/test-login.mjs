// Verify a real sign-in works. Run: node --env-file=.env.local scripts/test-login.mjs
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(url, anon, { auth: { persistSession: false } });

const { data, error } = await supabase.auth.signInWithPassword({
  email: "admin@hba.test",
  password: "Password123!",
});

if (error) {
  console.log("LOGIN_FAILED:", error.message);
  process.exit(2);
}
const { data: profile } = await supabase
  .from("profiles")
  .select("full_name, role")
  .eq("id", data.user.id)
  .single();
console.log(`LOGIN_OK: ${data.user.email} → role=${profile?.role}, name=${profile?.full_name}`);
