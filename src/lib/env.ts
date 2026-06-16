// Centralised env access + a guard so the app boots even before Supabase is
// configured (placeholders in .env.local). When not configured, auth/DB calls
// are skipped instead of throwing.

export const env = {
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
  appUrl: process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000",

  stripeSecret: process.env.STRIPE_SECRET_KEY ?? "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "",
  paymentCurrency: process.env.PAYMENT_CURRENCY ?? "MYR",

  whatsappToken: process.env.WHATSAPP_API_TOKEN ?? "",
  whatsappPhoneId: process.env.WHATSAPP_PHONE_NUMBER_ID ?? "",
  whatsappVerifyToken: process.env.WHATSAPP_VERIFY_TOKEN ?? "",
  whatsappApiVersion: process.env.WHATSAPP_API_VERSION ?? "v21.0",

  // whatsapp-web.js worker (see /wa-worker). When both are set, sends route to
  // the worker instead of the Meta Cloud API.
  waWorkerUrl: process.env.WA_WORKER_URL ?? "",
  waWorkerSecret: process.env.WA_WORKER_SECRET ?? "",
  // Invite link to the parent WhatsApp Community (https://chat.whatsapp.com/…).
  // Optional — when set, the Announcements page shows a one-tap "Open" button so
  // the admin can jump straight to the group to paste a notice. No worker.
  waCommunityLink: process.env.WA_COMMUNITY_LINK ?? "",
  // Serialized chat id of the Community Announcements group (e.g. "12036…@g.us").
  // When set, the worker auto-posts the monthly "Growth Reports ready" notice
  // here (one post, all parents) instead of messaging each parent. Find it via
  // the worker's GET /groups endpoint. The dedicated number must be a group admin.
  waCommunityGroupId: process.env.WA_COMMUNITY_GROUP_ID ?? "",
  // Human WhatsApp number parents send cash/transfer receipts to (E.164, e.g.
  // +60123456789). Shown on the parent fees page. Optional.
  academyWhatsapp: process.env.ACADEMY_WHATSAPP ?? "",

  nfcApiKey: process.env.NFC_API_KEY ?? "",
  cronSecret: process.env.CRON_SECRET ?? "",
};

// NB: do not add "" here — String.includes("") is always true.
const PLACEHOLDERS = ["placeholder", "YOUR-PROJECT", "YOUR_ANON_KEY"];

export function isSupabaseConfigured(): boolean {
  const u = env.supabaseUrl;
  const k = env.supabaseAnonKey;
  return (
    !!u &&
    !!k &&
    !PLACEHOLDERS.some((p) => u.includes(p)) &&
    !PLACEHOLDERS.some((p) => k.includes(p))
  );
}

export function isStripeConfigured(): boolean {
  return !!env.stripeSecret && env.stripeSecret.startsWith("sk_");
}

export function isWhatsappConfigured(): boolean {
  return !!env.whatsappToken && !!env.whatsappPhoneId;
}

export function isWaWorkerConfigured(): boolean {
  return !!env.waWorkerUrl && !!env.waWorkerSecret;
}
