import { requireRole } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Card, Field, Input } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { dict } from "@/lib/i18n";
import { FlashClear } from "@/components/flash-clear";
import { changeAdminPassword, updateAdminPhone } from "./actions";
import { TwoFactorSetup } from "@/components/two-factor-setup";
import { PushPanel } from "@/components/push-panel";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";
import { savePushSubscription, removePushSubscription, sendTestPushToSelf } from "../settings/push-actions";

export const dynamic = "force-dynamic";

export default async function AdminAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const me = await requireRole("admin");
  const L = dict(me.locale);
  const { saved, error } = await searchParams;
  const supabase = await createClient();
  const { data: factors } = await supabase.auth.mfa.listFactors();
  const totp = (factors?.totp ?? []).find((f) => f.status === "verified") ?? null;

  return (
    <div className="space-y-6">
      <PageHeader title={L.my_account} description={me.email ?? undefined} />

      {saved && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {saved === "contact" ? L.acc_phone_updated : L.acc_pw_updated}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}
      <FlashClear />

      <Card className="max-w-md p-6">
        <h2 className="text-base font-semibold text-slate-900">{L.contact_details}</h2>
        <p className="mt-1 text-sm text-slate-500">
          {L.acc_contact_hint}
        </p>
        <form action={updateAdminPhone} className="mt-4 space-y-4">
          <Field label={L.phone_label}>
            <Input type="tel" name="phone" defaultValue={me.phone ?? ""} autoComplete="tel" placeholder="012-345 6789" />
          </Field>
          <SubmitButton pendingText="…">{L.acc_save_phone}</SubmitButton>
        </form>
      </Card>

      <Card className="max-w-md p-6">
        <h2 className="text-base font-semibold text-slate-900">{L.change_password}</h2>
        <p className="mt-1 text-sm text-slate-500">{L.acc_pw_hint}</p>
        <form action={changeAdminPassword} className="mt-4 space-y-4">
          <Field label={L.current_pw} required>
            <Input type="password" name="current" required autoComplete="current-password" />
          </Field>
          <Field label={L.new_pw} required>
            <Input type="password" name="new_password" required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label={L.confirm_pw} required>
            <Input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
          </Field>
          <SubmitButton pendingText="…">{L.update_password}</SubmitButton>
        </form>
      </Card>

      <Card className="max-w-md p-6">
        <h2 className="text-base font-semibold text-slate-900">{L.two_factor}</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">{L.two_factor_hint}</p>
        <TwoFactorSetup enrolled={!!totp} factorId={totp?.id ?? null} />
      </Card>

      {/* Push opt-in — lives here (every admin) since Settings became super-only. */}
      {isPushConfigured() && (
        <Card className="max-w-md overflow-hidden p-0">
          <div className="border-b border-slate-100 p-6 pb-4">
            <h2 className="text-base font-semibold text-slate-900">{L.notifications}</h2>
            <p className="mt-1 text-sm text-slate-500">{L.acc_notif_hint}</p>
          </div>
          <PushPanel
            vapidPublicKey={getVapidPublicKey()}
            save={savePushSubscription}
            remove={removePushSubscription}
            test={sendTestPushToSelf}
          />
        </Card>
      )}
    </div>
  );
}
