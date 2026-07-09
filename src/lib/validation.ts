import { z } from "zod";
import { normalizePhoneMY } from "@/lib/wa";
import { CLASS_RANKS } from "@/lib/ranks";

const optionalStr = z.string().trim().optional().transform((v) => (v ? v : null));

// Stored as E.164 (+60…) so wa.me links and the WhatsApp worker always get a
// sendable number regardless of how the admin typed it.
const phoneField = z.string().trim().optional().transform((v) => normalizePhoneMY(v));

// IDs come from our own <select>/hidden fields and land in Postgres `uuid`
// columns (which validate format themselves). We avoid z.uuid() because its
// strict RFC-4122 check rejects placeholder/seed UUIDs like 0000…0011.
const optionalId = z.string().trim().optional().nullable().transform((v) => (v ? v : null));
const requiredId = z.string().trim().min(1, "Required");

export const studentSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required"),
  nickname: optionalStr,
  dob: optionalStr,
  gender: optionalStr,
  parent_id: optionalId,
  fee_plan_id: optionalId,
  branch_id: optionalId,
  coach_id: optionalId,
  nfc_tag_uid: optionalStr,
  status: z.enum(["active", "inactive"]).default("active"),
  notes: optionalStr,
});

export const clubMemberSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required"),
  email: optionalStr,
  phone: phoneField,
  tier_id: optionalId,
  profile_id: optionalId,
  status: z.enum(["active", "inactive"]).default("active"),
  notes: optionalStr,
});

// Public club self-signup (2b). Email is required — it receipts the payment and
// is how the member is later matched to a login. The tier is re-validated
// server-side (must be an active club fee plan) before any amount is used.
export const clubJoinSchema = z.object({
  full_name: z.string().trim().min(1, "Please enter your name"),
  email: z.string().trim().email("Enter a valid email"),
  phone: phoneField,
  tier_id: requiredId,
});

// Public "book a free trial" funnel (Phase 1) — no login, no payment. Phone is
// required (parents here are WhatsApp-first); email is optional. Consent must be
// ticked before we may contact them. Branch is optional and re-validated
// server-side. No student/parent row is created here — this is a lead.
const requiredPhoneMY = z
  .string()
  .trim()
  .min(1, "Phone number is required")
  .transform((v) => normalizePhoneMY(v))
  .refine((v): v is string => !!v, "Enter a valid phone number");

export const trialLeadSchema = z.object({
  child_name: z.string().trim().min(1, "The child's name is required"),
  child_dob: optionalStr,
  // Whitelist the three self-report options; anything else (incl. "") → null.
  experience: z.string().trim().optional().transform((v) =>
    v && ["none", "some", "experienced"].includes(v) ? v : null,
  ),
  parent_name: z.string().trim().min(1, "Your name is required"),
  phone: requiredPhoneMY,
  email: z.union([z.string().trim().email("Enter a valid email"), z.literal("")])
    .optional()
    .transform((v) => (v ? v : null)),
  // Parents pick a real upcoming session on the public form. Optional (still
  // supported: "Not sure yet — please contact me"). Server re-validates that
  // the id belongs to an active, in-horizon session before it is stamped, and
  // derives branch + human-readable slot label from it.
  session_id: optionalId,
  // Unticked checkbox → the key is absent → fails the refine with our message.
  consent: z.string().optional().transform((v) => v === "on")
    .refine((v) => v === true, "Please tick the box so we can contact you"),
});

export const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email required"),
  phone: phoneField,
  password: z.string().min(8, "Min 8 characters").optional().or(z.literal("")),
});

export const classSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  // Class rank — must be one of the fixed tiers; anything else (incl. "") → null.
  level: z.string().trim().optional().transform((v) =>
    v && (CLASS_RANKS as readonly string[]).includes(v) ? v : null,
  ),
  description: optionalStr,
  coach_id: optionalId,
  branch_id: optionalId,
  default_location: optionalStr,
  capacity: z.coerce.number().int().positive().optional().nullable().or(z.literal("")).transform((v) => (v === "" ? null : v)),
});

// Ad-hoc single session (makeup / one-off), created directly from the Sessions
// page without setting up a recurring weekly schedule.
export const sessionSchema = z.object({
  class_id: requiredId,
  session_date: z.string().trim().min(1, "Date is required"),
  start_time: z.string().trim().min(1, "Start time is required"),
  end_time: z.string().trim().min(1, "End time is required"),
  location: optionalStr,
  grace_minutes: z.coerce.number().int().min(0).max(120).default(15),
});

export const scheduleSchema = z.object({
  class_id: requiredId,
  day_of_week: z.coerce.number().int().min(0).max(6),
  start_time: z.string().min(1),
  end_time: z.string().min(1),
  location: optionalStr,
  grace_minutes: z.coerce.number().int().min(0).max(120).default(15),
});

export const feePlanSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: optionalStr,
  amount: z.coerce.number().positive("Amount must be > 0"),
  currency: z.string().default("MYR"),
  interval: z.enum(["monthly", "one_time"]).default("monthly"),
  // Which arm this plan bills for — academy (default) or the club.
  business: z.enum(["academy", "club"]).default("academy"),
  // Optional class-rank tag; anything outside the fixed set (incl. "") → null.
  rank: z.string().trim().optional().transform((v) =>
    v && (CLASS_RANKS as readonly string[]).includes(v) ? v : null,
  ),
  // Calculator pricing (see migration 0051). price_unit = what `amount` means
  // when quoting; sessions_per_week powers per-session math + proration; a single
  // sibling discount applies to the 2nd+ child.
  price_unit: z.enum(["month", "week", "session", "once"]).default("month"),
  sessions_per_week: z.coerce.number().int().min(0).max(14).optional().transform((v) => (v && v > 0 ? v : null)),
  sibling_discount_pct: z.coerce.number().min(0).max(100).default(0),
});

export const schemeSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: optionalStr,
});

export const criterionSchema = z.object({
  scheme_id: requiredId,
  name: z.string().trim().min(1, "Name is required"),
  weight: z.coerce.number().positive().default(1),
  max_score: z.coerce.number().positive().default(10),
  sort_order: z.coerce.number().int().default(0),
});

export const rewardRuleSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: optionalStr,
  points: z.coerce.number().int().default(0),
  config: z.string().optional().transform((v) => {
    if (!v) return null;
    try {
      return JSON.parse(v);
    } catch {
      throw new Error("Config must be valid JSON");
    }
  }),
});

export const invoiceSchema = z.object({
  student_id: requiredId,
  parent_id: optionalId,
  fee_plan_id: optionalId,
  description: optionalStr,
  amount: z.coerce.number().positive(),
  currency: z.string().default("MYR"),
  due_date: optionalStr,
});
