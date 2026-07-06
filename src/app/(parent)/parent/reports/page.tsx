import { redirect } from "next/navigation";

// Monthly report was merged into the Progress Card (2026-07-06). Keep the route
// so old links/bookmarks still land somewhere useful.
export default function ParentReportsPage() {
  redirect("/parent/scorecards");
}
