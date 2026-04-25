import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { ProjectForm } from "@/features/projects/form";
import { getProjectBySlug } from "@/features/projects/services";

export const metadata = { title: "Edit project" };

export default async function EditProjectPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const project = await getProjectBySlug(slug);
  if (!project || project.source === "mock" && !project.id) notFound();
  if (!project) notFound();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Projects", href: "/dashboard/projects" },
          { label: project.name, href: `/dashboard/projects/${project.slug}` },
          { label: "Edit" },
        ]}
        title={`Edit · ${project.name}`}
        description="Updates produce an audit event with before / after diff."
      />
      <DbStatusNotice />
      <ProjectForm
        mode="edit"
        defaults={{
          id: project.id,
          slug: project.slug,
          name: project.name,
          concept: project.concept,
          location: project.location,
          area: project.area,
          description: project.description,
          status: project.status,
          managementStatus: project.managementStatus,
          totalVillas: project.totalVillas,
          targetHandoverDate: project.targetHandoverDate,
          leaseholdUntil: project.leaseholdUntil,
        }}
        cancelHref={`/dashboard/projects/${project.slug}`}
      />
    </div>
  );
}
