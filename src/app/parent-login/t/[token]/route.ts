import { NextResponse, type NextRequest } from "next/server";
import { consumeLoginToken, setParentSessionCookie } from "@/lib/parent-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// One-time login link consume — admin generates the URL, sends it via WhatsApp,
// the parent taps it. Issues the 1-year session cookie and lands on the parent
// dashboard. A passwordless fallback alongside email + password sign-in.
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const result = await consumeLoginToken(token);

  const origin = req.nextUrl.origin;
  if (!result.ok) {
    const reason =
      result.reason === "expired"
        ? "This login link has expired — please contact the academy for a fresh one."
        : result.reason === "used"
        ? "This login link has already been used. Sign in with your email + password, or ask the academy for a new link."
        : "Login link is invalid. Please contact the academy.";
    return NextResponse.redirect(`${origin}/parent-login?error=${encodeURIComponent(reason)}`);
  }

  await setParentSessionCookie(result.profileId);
  return NextResponse.redirect(`${origin}/parent`);
}
