import { PageHeader } from "@/components/ui/page-header";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { PlaceForm } from "@/components/villa-guides/place-form";

export const metadata = { title: "New neighborhood place" };
export const dynamic = "force-dynamic";

export default async function NewPlacePage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Neighborhood", href: "/dashboard/villa-guides/neighborhood" },
          { label: "New" },
        ]}
        title="New neighborhood place"
      />
      <PlaceForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
