import { PageHeader } from "@/components/ui/page-header";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { WifiForm } from "@/components/villa-guides/wifi-form";

export const metadata = { title: "Add Wi-Fi" };
export const dynamic = "force-dynamic";

export default async function NewWifiPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Wi-Fi", href: "/dashboard/villa-guides/wifi" },
          { label: "New" },
        ]}
        title="Add Wi-Fi"
      />
      <WifiForm
        villas={villas.map((v) => ({
          id: v.id,
          label: `${v.unitCode} · ${v.projectName}`,
        }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
