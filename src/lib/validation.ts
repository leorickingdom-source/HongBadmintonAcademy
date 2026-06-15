import { z } from "zod";
import { normalizePhoneMY } from "@/lib/wa";

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
  dob: optionalStr,
  gender: optionalStr,
  parent_id: optionalId,
  fee_plan_id: optionalId,
  nfc_tag_uid: optionalStr,
  status: z.enum(["active", "inactive"]).default("active"),
  notes: optionalStr,
});

export const profileSchema = z.object({
  full_name: z.string().trim().min(1, "Name is required"),
  email: z.string().trim().email("Valid email required"),
  phone: phoneField,
  password: z.string().min(8, "Min 8 characters").optional().or(z.literal("")),
});

export const classSchema = z.object({
  name: z.string().trim().min(1, "Name is required"),
  description: optionalStr,
  coach_id: optionalId,
  default_location: optionalStr,
  capacity: z.coerce.number().int().positive().optional().nullable().or(z.literal("")).transform((v) => (v === "" ? null : v)),
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
