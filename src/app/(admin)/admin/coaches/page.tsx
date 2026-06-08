import { PeopleList } from "../_people/people-list";
import { deletePerson } from "../_people/actions";

export const dynamic = "force-dynamic";

export default function CoachesPage() {
  return <PeopleList role="coach" deleteAction={deletePerson.bind(null, "coach")} />;
}
