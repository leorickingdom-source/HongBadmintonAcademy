import Link from "next/link";
import { dict } from "@/lib/i18n";
import { getPublicLocale } from "@/lib/public-locale";

export const dynamic = "force-dynamic";

export default async function TrialThanksPage() {
  const L = dict(await getPublicLocale());
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-5 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
      <h1 className="text-2xl font-bold text-slate-900">{L.trt_title}</h1>
      <p className="max-w-sm text-sm text-slate-500">
        {L.trt_body}
      </p>
      <Link href="/trial" className="text-sm font-medium text-emerald-700 hover:underline">{L.trt_again}</Link>
    </main>
  );
}
