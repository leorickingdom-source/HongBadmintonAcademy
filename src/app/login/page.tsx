import { Feather } from "lucide-react";
import { APP_NAME } from "@/lib/constants";
import { isSupabaseConfigured } from "@/lib/env";
import { Card, Field, Input, LinkButton } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { dict } from "@/lib/i18n";
import { getPublicLocale } from "@/lib/public-locale";
import { PublicLangToggle } from "@/components/public-lang-toggle";
import { signIn } from "./actions";

export const dynamic = "force-dynamic";

// Single sign-in for staff and parents — the action routes by role.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; next?: string }>;
}) {
  const { error, next } = await searchParams;
  const configured = isSupabaseConfigured();
  const locale = await getPublicLocale();
  const L = dict(locale);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-100 p-4">
      <Card className="w-full max-w-sm p-8">
        <div className="mb-2 flex justify-end">
          <PublicLangToggle locale={locale} />
        </div>
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-green-600 text-white">
            <Feather className="h-6 w-6" />
          </div>
          <h1 className="text-lg font-semibold text-slate-900">{APP_NAME}</h1>
          <p className="text-sm text-slate-500">{L.li_sign_in}</p>
        </div>

        {!configured && (
          <div className="mb-4 rounded-md bg-amber-50 p-3 text-xs text-amber-800">
            {L.li_not_config}
          </div>
        )}

        <form action={signIn} className="space-y-4">
          <input type="hidden" name="next" value={next ?? ""} />
          <Field label={L.email_label} required>
            <Input type="email" name="email" required autoComplete="email" />
          </Field>
          <Field label={L.pf_password} required>
            <Input type="password" name="password" required autoComplete="current-password" />
          </Field>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <SubmitButton className="w-full" pendingText={L.li_signing_in} disabled={!configured}>
            {L.li_sign_in}
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-xs text-slate-500">
          <a href="/parent-login/forgot" className="font-medium text-green-700 hover:underline">
            {L.li_forgot}
          </a>
          <br />
          <span className="text-slate-400">{L.li_staff_reset}</span>
        </p>

        <div className="mt-6 border-t border-slate-200 pt-5 text-center">
          <p className="mb-2 text-sm text-slate-600">{L.li_new_here}</p>
          <LinkButton href="/trial" variant="secondary" className="w-full">
            {L.li_book_trial}
          </LinkButton>
        </div>
      </Card>
    </main>
  );
}
