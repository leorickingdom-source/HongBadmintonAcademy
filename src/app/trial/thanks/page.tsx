import Link from "next/link";
import { dict } from "@/lib/i18n";
import { getPublicLocale } from "@/lib/public-locale";
import { createAdminClient } from "@/lib/supabase/admin";
import { formatDate, formatTime } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function TrialThanksPage({
  searchParams,
}: {
  searchParams: Promise<{ sid?: string }>;
}) {
  const { sid } = await searchParams;
  const L = dict(await getPublicLocale());

  let picked: { when: string; where: string | null; className: string } | null = null;
  if (sid) {
    const db = createAdminClient();
    const { data: s } = await db
      .from("sessions")
      .select("session_date, start_time, classes(name), branches(name)")
      .eq("id", sid)
      .maybeSingle();
    if (s) {
      picked = {
        when: `${formatDate((s as any).session_date)} · ${formatTime((s as any).start_time)}`,
        where: (s as any).branches?.name ?? null,
        className: (s as any).classes?.name ?? "",
      };
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-5 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
      <h1 className="text-2xl font-bold text-slate-900">{picked ? L.trt_booked_title : L.trt_title}</h1>

      {picked ? (
        <div className="w-full max-w-sm rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 text-sm text-emerald-900">
          <div className="font-semibold">{picked.when}</div>
          <div className="mt-0.5 text-emerald-800/90">
            {[picked.where, picked.className].filter(Boolean).join(" · ")}
          </div>
        </div>
      ) : null}

      <p className="max-w-sm text-sm text-slate-500">
        {picked ? L.trt_booked_body : L.trt_body}
      </p>
      <Link href="/trial" className="text-sm font-medium text-emerald-700 hover:underline">{L.trt_again}</Link>
    </main>
  );
}
