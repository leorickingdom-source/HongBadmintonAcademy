import { redirect } from "next/navigation";

// Parents now live under the unified People page.
export default function ParentsPage() {
  redirect("/admin/people?tab=parents");
}
