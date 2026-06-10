import { redirect } from "next/navigation";

// Coaches now live under the unified People page.
export default function CoachesPage() {
  redirect("/admin/people?tab=coaches");
}
