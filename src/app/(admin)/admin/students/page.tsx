import { redirect } from "next/navigation";

// Students now live under the unified People page.
export default function StudentsPage() {
  redirect("/admin/people?tab=students");
}
