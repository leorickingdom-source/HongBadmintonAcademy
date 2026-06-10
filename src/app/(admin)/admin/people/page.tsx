import Link from "next/link";
import { PageHeader, LinkButton, cn } from "@/components/ui";
import { StudentsList } from "../students/students-list";
import { PeopleList } from "../_people/people-list";
import { deleteStudents } from "../students/actions";
import { deletePerson, deletePeople } from "../_people/actions";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "students", label: "Students" },
  { key: "parents", label: "Parents" },
  { key: "coaches", label: "Coaches" },
] as const;

type Tab = (typeof TABS)[number]["key"];

export default async function PeoplePage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const active: Tab = TABS.some((t) => t.key === tab) ? (tab as Tab) : "students";

  const newButton =
    active === "students" ? (
      <LinkButton href="/admin/students/new">+ New student</LinkButton>
    ) : active === "parents" ? (
      <LinkButton href="/admin/parents/new">+ New parent</LinkButton>
    ) : (
      <LinkButton href="/admin/coaches/new">+ New coach</LinkButton>
    );

  return (
    <div>
      <PageHeader
        title="People"
        description="Students, parents and coaches — all in one place."
        action={
          <>
            {active === "coaches" && (
              <LinkButton href="/admin/coaches/summary" variant="secondary">💰 Payroll</LinkButton>
            )}
            {active === "students" && (
              <LinkButton href="/admin/leaderboard" variant="secondary">🏆 Leaderboard</LinkButton>
            )}
            {newButton}
          </>
        }
      />

      <div className="mb-5 flex gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const on = t.key === active;
          return (
            <Link
              key={t.key}
              href={`/admin/people?tab=${t.key}`}
              className={cn(
                "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
                on
                  ? "border-green-600 text-green-700"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
            </Link>
          );
        })}
      </div>

      {active === "students" && <StudentsList />}
      {active === "parents" && (
        <PeopleList
          role="parent"
          embedded
          deleteAction={deletePerson.bind(null, "parent")}
          deleteManyAction={deletePeople.bind(null, "parent")}
        />
      )}
      {active === "coaches" && (
        <PeopleList
          role="coach"
          embedded
          deleteAction={deletePerson.bind(null, "coach")}
          deleteManyAction={deletePeople.bind(null, "coach")}
        />
      )}
    </div>
  );
}
