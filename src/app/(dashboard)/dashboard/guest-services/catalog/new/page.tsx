import "server-only";

import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { ServiceEditorForm } from "@/components/guest-services/service-editor";
import { listCategories } from "@/features/guest-services/services";
import { listProjects } from "@/features/projects/services";
import { listVillas } from "@/features/villas/services";

export const metadata = { title: "New service" };
export const dynamic = "force-dynamic";

export default async function NewServicePage() {
  const [categories, projects, villas] = await Promise.all([
    listCategories(),
    listProjects(),
    listVillas(),
  ]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Guest services", href: "/dashboard/guest-services" },
          {
            label: "Catalog",
            href: "/dashboard/guest-services/catalog",
          },
          { label: "New" },
        ]}
        title="New service"
        description="Leave both project and villa empty for a global service. Set villa to override a project-scoped row for a single property."
      />
      <Section eyebrow="Create" title="Service details">
        <ServiceEditorForm
          categories={categories.map((c) => ({ id: c.id, name: c.name }))}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          villas={villas.map((v) => ({
            id: v.id,
            unitCode: v.unitCode,
            projectName: v.projectName,
          }))}
        />
      </Section>
    </div>
  );
}
