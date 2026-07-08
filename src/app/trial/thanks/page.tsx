import Link from "next/link";

export default function TrialThanksPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center gap-4 px-5 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-2xl text-emerald-700">✓</div>
      <h1 className="text-2xl font-bold text-slate-900">Request received!</h1>
      <p className="max-w-sm text-sm text-slate-500">
        Thanks — we&apos;ve got your details. One of our team will contact you by phone or WhatsApp to arrange your child&apos;s free trial session and answer any questions. No payment is needed for the trial.
      </p>
      <Link href="/trial" className="text-sm font-medium text-emerald-700 hover:underline">Submit another request</Link>
    </main>
  );
}
