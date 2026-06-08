import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Download a score card PDF. RLS on the session client ensures the caller may
// see this card (admin, the student's parent, or a coach); then we hand back a
// short-lived signed URL to the private object.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: sc } = await supabase
    .from("scorecards")
    .select("pdf_url")
    .eq("id", id)
    .maybeSingle();

  if (!sc) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!sc.pdf_url) {
    return NextResponse.json({ error: "PDF not generated yet" }, { status: 404 });
  }

  const admin = createAdminClient();
  const { data: signed, error } = await admin.storage
    .from("scorecards")
    .createSignedUrl(sc.pdf_url, 60);

  if (error || !signed?.signedUrl) {
    return NextResponse.json({ error: "Could not sign URL" }, { status: 500 });
  }
  return NextResponse.redirect(signed.signedUrl);
}
