import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PageHeader, Section, Badge, EmptyState, cn } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { ConfirmButton } from "@/components/confirm-button";
import { studentRank, rankBadgeClass } from "@/lib/ranks";
import { PersonForm } from "../../_people/person-form";
import {
  updatePerson,
  unlinkChild,
  generateParentLoginLink,
  sendParentPasswordReset,
} from "../../_people/actions";
import { LoginLinkPanel } from "./login-link-panel";

export const dynamic = "force-dynamic";

export default async function EditParentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    error?: string;
    saved?: string;
    link?: string;
    wa?: string;
  }>;
}) {
  const { id } = await params;
  const { error, saved, link, wa } = await searchParams;
  const supabase = await createClient();
  const [{ data: person }, { data: children }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("students").select("id, full_name, status, rank").eq("parent_id", id).order("full_name"),
  ]);
  if (!person) notFound();

  // Effective rank per child (own rank, else highest enrolled-class rank).
  const kidIds = (children ?? []).map((c: any) => c.id);
  const { data: enr } = kidIds.length
    ? await supabase.from("enrollments").select("student_id, classes(level)").eq("active", true).in("student_id", kidIds)
    : { data: [] as any[] };
  const levelsByKid = new Map<string, (string | null)[]>();
  for (const e of (enr ?? []) as any[]) {
    const arr = levelsByKid.get(e.student_id) ?? [];
    arr.push(e.classes?.level ?? null);
    levelsByKid.set(e.student_id, arr);
  }

  return (
    <div className="space-y-6">
      <PageHeader title="Edit parent" description={person.full_name ?? undefined} />

      {saved && (
        <p className="rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-700">
          {saved}
        </p>
      )}

      <Section
        title="Parent app sign-in"
        description="Parents sign in with their email + password. Send a reset email, or a one-tap login link."
      >
        <div className="space-y-4 p-5">
          <div className="flex flex-wrap gap-2">
            <form action={sendParentPasswordReset}>
              <input type="hidden" name="parent_id" value={id} />
              <SubmitButton pendingText="Sending…">Send password reset email</SubmitButton>
            </form>
            <form action={generateParentLoginLink}>
              <input type="hidden" name="parent_id" value={id} />
              <SubmitButton variant="secondary" pendingText="Generating…">Generate login link</SubmitButton>
            </form>
          </div>

          {link && <LoginLinkPanel link={link} wa={wa ?? null} />}
        </div>
      </Section>

      <Section title={`Children (${children?.length ?? 0})`} flush>
        {children && children.length > 0 ? (
          <ul className="divide-y divide-slate-100">
            {children.map((c: any) => {
              const rank = studentRank(c.rank, levelsByKid.get(c.id) ?? []);
              return (
                <li key={c.id} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-slate-50">
                  <Link href={`/admin/students/${c.id}`} className="flex min-w-0 items-center gap-2">
                    <span className="font-medium text-slate-900">{c.full_name}</span>
                    {rank && (
                      <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", rankBadgeClass(rank))}>{rank}</span>
                    )}
                  </Link>
                  <div className="flex flex-shrink-0 items-center gap-2">
                    <Badge tone={c.status === "active" ? "green" : "slate"}>{c.status}</Badge>
                    <form action={unlinkChild}>
                      <input type="hidden" name="student_id" value={c.id} />
                      <input type="hidden" name="parent_id" value={id} />
                      <ConfirmButton label="Unlink" confirmText={`Remove ${c.full_name} from this parent? The student stays, just unlinked.`} />
                    </form>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : (
          <div className="p-5"><EmptyState message="No children linked to this parent yet." /></div>
        )}
      </Section>

      <PersonForm
        role="parent"
        person={person}
        action={updatePerson.bind(null, "parent")}
        error={error}
      />
    </div>
  );
}
