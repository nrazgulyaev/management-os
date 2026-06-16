import Link from "next/link";
import { SectionHeading } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { EmptyState } from "@/components/ui/empty-state";
import { listProjects } from "@/features/projects/services";
import { VillaForm } from "./form";

export const metadata = { title: "New villa" };
export const dynamic = "force-dynamic";

export default async function NewVillaPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project } = await searchParams;
  const projects = await listProjects();

  return (
    <div className="flex flex-col gap-8">
      <SectionHeading
        eyebrow="Portfolio · villas · new"
        title="New villa"
        subtitle="Create a new villa unit. The unit code must be unique inside the project."
      />
      <DbStatusNotice />
      {projects.length === 0 ? (
        <EmptyState
          title="Add a project first"
          description="Every villa is created under a project. Create your first project, then come back to register villas under it."
          action={
            <Link href="/dashboard/projects/new" className="btn btn-primary btn-sm">
              Create a project
            </Link>
          }
        />
      ) : (
        <VillaForm
          mode="create"
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          defaultProjectId={project}
        />
      )}
    </div>
  );
}
