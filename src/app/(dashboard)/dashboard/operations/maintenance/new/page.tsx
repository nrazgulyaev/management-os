import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { MaintenanceTicketForm } from "@/components/operations/maintenance-form";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";

export const metadata = { title: "New maintenance ticket" };
export const dynamic = "force-dynamic";

export default async function NewMaintenanceTicketPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Maintenance", href: "/dashboard/operations/maintenance" },
          { label: "New" },
        ]}
        title="New maintenance ticket"
        description="Open a maintenance ticket. The repair workflow can be promoted to a generated task."
      />
      <DbStatusNotice />
      <MaintenanceTicketForm
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        cancelHref="/dashboard/operations/maintenance"
      />
    </div>
  );
}
