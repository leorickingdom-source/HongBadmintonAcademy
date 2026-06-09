import { PeopleList } from "../_people/people-list";
import { deletePerson } from "../_people/actions";
import { LinkButton } from "@/components/ui";

export const dynamic = "force-dynamic";

export default function CoachesPage() {
  return (
    <PeopleList
      role="coach"
      deleteAction={deletePerson.bind(null, "coach")}
      extraAction={
        <LinkButton href="/admin/coaches/summary" variant="secondary">💰 Payroll</LinkButton>
      }
    />
  );
}
