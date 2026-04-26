import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { PreventiveScheduleForm } from "@/components/operations/preventive-form";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listAppUsers } from "@/features/auth/users-service";
import { listChecklistTemplates } from "@/features/operations/services";

export const metadata = { title: "New preventive schedule" };
export const dynamic = "force-dynamic";

export default async function NewPreventivePage() {
  const [villas, projects, users, templates] = await Promise.all([
    listVillas(),
    listProjects(),
    listAppUsers(),
    listChecklistTemplates(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Preventive", href: "/dashboard/operations/preventive" },
          { label: "New" },
        ]}
        title="New preventive schedule"
        description="Define a recurring inspection or service. Tasks materialise when the schedule comes due."
      />
      <DbStatusNotice />
      <PreventiveScheduleForm
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        templates={templates.map((t) => ({ id: t.id, label: t.name }))}
        appUsers={users.map((u) => ({ id: u.id, label: `${u.fullName} · ${u.email}` }))}
        cancelHref="/dashboard/operations/preventive"
      />
    </div>
  );
}
