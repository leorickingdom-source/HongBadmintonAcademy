import { requireParent } from "@/lib/parent-auth";
import { PageHeader, Card, Field, Input, Button } from "@/components/ui";
import { changeParentPassword } from "./actions";

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

      <Card className="max-w-md p-6">
        <h2 className="text-base font-semibold text-slate-900">Change password</h2>
        <p className="mt-1 text-sm text-slate-500">Update the password you use to sign in.</p>

        {saved && (
          <p className="mt-4 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
            Password updated.
          </p>
        )}
        {error && (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>
        )}

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
    </div>
  );
}
