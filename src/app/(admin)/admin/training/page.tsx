import { requireRole } from "@/lib/auth";
import { PageHeader } from "@/components/ui";
import { TrainingSyllabus } from "@/components/training-syllabus";

export const dynamic = "force-dynamic";

export default async function AdminTrainingPage() {
  await requireRole("admin");
  return (
    <div className="space-y-6">
      <PageHeader
        title="Training syllabus"
        description="The HBA 6-level curriculum and promotion-exam rubric. Coaches grade exams under Level Exams; this is the reference."
      />
      <TrainingSyllabus />
    </div>
  );
}
