import { createClient } from "@supabase/supabase-js";
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
const { data: parents } = await db.from("profiles").select("full_name, phone").eq("role", "parent");
console.log("PARENTS:");
for (const p of parents ?? []) console.log(`  ${p.full_name}: phone=${JSON.stringify(p.phone)}`);

const { data: inv } = await db
  .from("invoices")
  .select("invoice_no, amount, status, students(full_name), parent:profiles!invoices_parent_id_fkey(full_name, phone)")
  .order("created_at", { ascending: false });
console.log("\nINVOICES (newest first):");
for (const i of inv ?? []) {
  const phone = i.parent?.phone;
  const digits = phone ? phone.replace(/[^\d]/g, "") : null;
  console.log(`  ${i.invoice_no} ${i.students?.full_name} -> parent ${i.parent?.full_name} phone=${JSON.stringify(phone)} -> wa.me/${digits}`);
}
