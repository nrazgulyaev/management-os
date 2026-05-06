import { PageHeader } from "@/components/ui/page-header";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { CameraForm } from "@/components/security/camera-form";

export const metadata = { title: "New camera" };
export const dynamic = "force-dynamic";

export default async function NewCameraPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Security", href: "/dashboard/security" },
          { label: "Cameras", href: "/dashboard/security/cameras" },
          { label: "New" },
        ]}
        title="New camera"
        description="Registry entry — name, location, vendor portal URL. The platform never streams video."
      />
      <CameraForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
