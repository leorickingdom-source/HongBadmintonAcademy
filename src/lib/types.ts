// App-facing row types. (Full generated types can be produced later with
// `npm run db:types` once the schema is pushed to a project.)

export type Role = "super_admin" | "admin" | "coach" | "parent";
export type StudentStatus = "active" | "inactive";
export type SessionStatus = "scheduled" | "in_progress" | "completed" | "canceled";
export type AttendanceStatus = "present" | "late" | "absent" | "excused";
export type FeeInterval = "monthly" | "one_time";
export type InvoiceStatus =
  | "draft" | "unpaid" | "paid" | "overdue" | "canceled" | "refunded";
export type PaymentStatus = "pending" | "succeeded" | "failed" | "refunded";
export type MessageType = "scorecard" | "payment_reminder" | "custom";
export type MessageStatus = "queued" | "sent" | "delivered" | "read" | "failed";
export type ScorecardStatus = "draft" | "generated" | "sent";

export interface Profile {
  id: string;
  role: Role;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  is_active: boolean;
  branch_id: string | null;
  locale: string | null;
  stripe_customer_id: string | null;
  created_at: string;
}

export interface Branch {
  id: string;
  name: string;
  code: string | null;
  address: string | null;
  phone: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
  // Check-in geofence (0060). Off unless geofence_enabled + coords are set.
  lat: number | null;
  lng: number | null;
  geofence_radius_m: number;
  geofence_enabled: boolean;
  geofence_required: boolean;
}

export interface Student {
  id: string;
  full_name: string;
  nickname: string | null;
  dob: string | null;
  gender: string | null;
  parent_id: string | null;
  fee_plan_id: string | null;
  branch_id: string | null;
  coach_id: string | null;
  nfc_tag_uid: string | null;
  rank: string | null;
  level: number | null;
  status: StudentStatus;
  photo_url: string | null;
  notes: string | null;
  created_at: string;
}

export interface ClassRow {
  id: string;
  name: string;
  level: string | null;
  description: string | null;
  coach_id: string | null;
  branch_id: string | null;
  default_location: string | null;
  capacity: number | null;
  is_active: boolean;
}

export interface ClassSchedule {
  id: string;
  class_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  location: string | null;
  grace_minutes: number;
  is_active: boolean;
}

export interface SessionRow {
  id: string;
  class_id: string;
  session_date: string;
  start_time: string;
  end_time: string;
  location: string | null;
  branch_id: string | null;
  status: SessionStatus;
  grace_minutes: number;
}

export interface Attendance {
  id: string;
  session_id: string;
  student_id: string;
  status: AttendanceStatus;
  tap_in_at: string | null;
  tap_out_at: string | null;
  flagged: boolean;
  flag_reason: string | null;
}

export interface MarkingScheme {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
}

export interface MarkingCriterion {
  id: string;
  scheme_id: string;
  name: string;
  description: string | null;
  weight: number;
  max_score: number;
  sort_order: number;
}

export type PriceUnit = "month" | "week" | "session" | "once";

export interface FeePlan {
  id: string;
  name: string;
  description: string | null;
  amount: number;
  currency: string;
  interval: FeeInterval;
  business: "academy" | "club";
  rank: string | null;
  price_unit: PriceUnit;
  sessions_per_week: number | null;
  sibling_discount_pct: number;
  is_active: boolean;
  stripe_product_id: string | null;
  stripe_price_id: string | null;
}

export interface Invoice {
  id: string;
  invoice_no: string | null;
  student_id: string | null;
  parent_id: string | null;
  branch_id: string | null;
  description: string | null;
  amount: number;
  currency: string;
  period_month: string | null;
  due_date: string | null;
  status: InvoiceStatus;
  paid_at: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  invoice_id: string | null;
  amount: number;
  currency: string;
  provider: string;
  provider_txn_id: string | null;
  status: PaymentStatus;
  method: string | null;
  created_at: string;
}

export interface Scorecard {
  id: string;
  student_id: string;
  period_month: string;
  summary: Record<string, unknown> | null;
  pdf_url: string | null;
  status: ScorecardStatus;
  generated_at: string | null;
}

export interface Message {
  id: string;
  type: MessageType;
  recipient_phone: string;
  template_name: string | null;
  status: MessageStatus;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
}

export interface RewardRule {
  id: string;
  name: string;
  description: string | null;
  config: Record<string, unknown> | null;
  points: number;
  is_active: boolean;
}
