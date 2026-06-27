import { requireParent } from "@/lib/parent-auth";
import { PageHeader, Card, Field, Input, Button } from "@/components/ui";
import { changeParentPassword, updateParentContact } from "./actions";
import { getVapidPublicKey, isPushConfigured } from "@/lib/push";
import { PushPanel } from "@/components/push-panel";
import { saveParentPush, removeParentPush, sendTestParentPush } from "./push-actions";

export const dynamic = "force-dynamic";

export default async function ParentAccountPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const me = await requireParent();
  const { saved, error } = await searchParams;

  return (
    <div className="space-y-6">
      <PageHeader title="Account" description={me.email ?? undefined} />

      {saved && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {saved === "contact" ? "Contact details updated." : "Password updated."}
        </p>
      )}
      {error && (
        <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
      )}

      <Card className="max-w-md p-6">
        <h2 className="text-base font-semibold text-slate-900">Contact details</h2>
        <p className="mt-1 text-sm text-slate-500">
          You sign in with this email; we use your phone for WhatsApp updates.
        </p>
        <form action={updateParentContact} className="mt-4 space-y-4">
          <Field label="Email" required>
            <Input type="email" name="email" defaultValue={me.email ?? ""} required autoComplete="email" />
          </Field>
          <Field label="Phone">
            <Input type="tel" name="phone" defaultValue={me.phone ?? ""} autoComplete="tel" placeholder="012-345 6789" />
          </Field>
          <Field label="Current password" hint="Only needed when changing your email">
            <Input type="password" name="current" autoComplete="current-password" />
          </Field>
          <Button type="submit">Save contact</Button>
        </form>
      </Card>

      <Card className="max-w-md p-6">
        <h2 className="text-base font-semibold text-slate-900">Change password</h2>
        <p className="mt-1 text-sm text-slate-500">Update the password you use to sign in.</p>
        <form action={changeParentPassword} className="mt-4 space-y-4">
          <Field label="Current password" required>
            <Input type="password" name="current" required autoComplete="current-password" />
          </Field>
          <Field label="New password" required>
            <Input type="password" name="new_password" required minLength={8} autoComplete="new-password" />
          </Field>
          <Field label="Confirm new password" required>
            <Input type="password" name="confirm" required minLength={8} autoComplete="new-password" />
          </Field>
          <Button type="submit">Update password</Button>
        </form>
      </Card>

      {isPushConfigured() && (
        <Card className="max-w-md overflow-hidden p-0">
          <div className="border-b border-slate-100 p-6 pb-4">
            <h2 className="text-base font-semibold text-slate-900">Notifications</h2>
            <p className="mt-1 text-sm text-slate-500">Get a push for new exam results and fee reminders.</p>
          </div>
          <PushPanel
            vapidPublicKey={getVapidPublicKey()}
            save={saveParentPush}
            remove={removeParentPush}
            test={sendTestParentPush}
          />
        </Card>
      )}
    </div>
  );
}
