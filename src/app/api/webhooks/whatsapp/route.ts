import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { env } from "@/lib/env";

export const runtime = "nodejs";

// Meta webhook verification (GET) — set this URL + verify token in the Meta app.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (
    p.get("hub.mode") === "subscribe" &&
    p.get("hub.verify_token") === env.whatsappVerifyToken
  ) {
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("Forbidden", { status: 403 });
}

// Delivery-status callbacks → update the message log.
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const db = createAdminClient();
  const statuses =
    body?.entry?.flatMap(
      (e: any) => e?.changes?.flatMap((c: any) => c?.value?.statuses ?? []) ?? [],
    ) ?? [];

  for (const s of statuses) {
    const id = s?.id as string | undefined;
    const status = s?.status as string | undefined; // sent | delivered | read | failed
    if (!id || !status) continue;

    const patch: Record<string, unknown> = { status };
    if (status === "delivered") patch.delivered_at = new Date().toISOString();
    if (status === "read") patch.read_at = new Date().toISOString();
    if (status === "failed") patch.error = s?.errors?.[0]?.title ?? "Delivery failed";

    await db.from("messages").update(patch).eq("provider_message_id", id);
  }

  return NextResponse.json({ ok: true });
}
