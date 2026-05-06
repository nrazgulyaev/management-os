import { PageHeader } from "@/components/ui/page-header";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { GuideSectionForm } from "@/components/villa-guides/section-form";

export const metadata = { title: "New guide section" };
export const dynamic = "force-dynamic";

export default async function NewSectionPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Sections", href: "/dashboard/villa-guides/sections" },
          { label: "New" },
        ]}
        title="New guide section"
      />
      <GuideSectionForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
