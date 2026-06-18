import webpush from "web-push";

const PUBLIC = process.env.VAPID_PUBLIC_KEY ?? "";
const PRIVATE = process.env.VAPID_PRIVATE_KEY ?? "";
const SUBJECT = process.env.VAPID_SUBJECT ?? "mailto:admin@hongbadminton.example";

let configured = false;
function ensure(): boolean {
  if (configured) return true;
  if (!PUBLIC || !PRIVATE) return false;
  webpush.setVapidDetails(SUBJECT, PUBLIC, PRIVATE);
  configured = true;
  return true;
}

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? PUBLIC;
}

export function isPushConfigured(): boolean {
  return Boolean(PUBLIC && PRIVATE);
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

export interface PushSubRow {
  endpoint: string;
  p256dh: string;
  auth: string;
}

// Sends one push to one subscription. Returns ok / 410-gone (caller deletes) / error.
export async function sendPush(
  sub: PushSubRow,
  payload: PushPayload,
): Promise<{ ok: boolean; gone?: boolean; error?: string }> {
  if (!ensure()) return { ok: false, error: "VAPID not configured" };
  try {
    await webpush.sendNotification(
      {
        endpoint: sub.endpoint,
        keys: { p256dh: sub.p256dh, auth: sub.auth },
      },
      JSON.stringify(payload),
      { TTL: 60 },
    );
    return { ok: true };
  } catch (e: any) {
    const status = e?.statusCode as number | undefined;
    if (status === 404 || status === 410) return { ok: false, gone: true };
    return { ok: false, error: e?.message ?? String(e) };
  }
}
