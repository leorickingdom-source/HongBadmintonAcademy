import { NextResponse, type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { verifyParentCookieValue, PARENT_COOKIE_NAME } from "@/lib/parent-cookie-edge";

// Supabase-auth-gated: admin + coach. Custom parent-cookie-gated: /parent.
const SUPABASE_PROTECTED = ["/admin", "/coach"];
const PARENT_PROTECTED = "/parent";

export async function middleware(request: NextRequest) {
  const path = request.nextUrl.pathname;

  // Parent area is gated by the hba_parent cookie (Supabase auth not required).
  const isParentArea = path === PARENT_PROTECTED || path.startsWith(PARENT_PROTECTED + "/");
  if (isParentArea) {
    const cookieValue = request.cookies.get(PARENT_COOKIE_NAME)?.value;
    const pid = await verifyParentCookieValue(cookieValue);
    if (!pid) {
      const url = request.nextUrl.clone();
      url.pathname = "/parent-login";
      if (path !== "/parent") url.searchParams.set("next", path);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  // Admin / coach still flow through Supabase Auth.
  const { response, user } = await updateSession(request);

  const isSupabaseProtected = SUPABASE_PROTECTED.some((p) => path === p || path.startsWith(p + "/"));
  if (isSupabaseProtected && !user) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // NOTE: intentionally do NOT redirect /login away when a Supabase `user`
  // exists. A stale/orphaned auth session (user with no resolvable profile)
  // would otherwise bounce /login → "/" → parent cookie → /parent-login,
  // making staff login unreachable. /login always renders the form; a fresh
  // sign-in replaces the session and the root router lands them by role.
  return response;
}

export const config = {
  // Run on everything except static assets and the NFC/webhook/cron APIs
  // (those authenticate themselves via secrets, not cookies).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/nfc|api/webhooks|api/cron|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
