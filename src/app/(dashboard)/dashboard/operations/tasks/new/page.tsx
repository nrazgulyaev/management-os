import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { TaskForm } from "@/components/operations/task-form";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listAppUsers } from "@/features/auth/users-service";
import { listChecklistTemplates } from "@/features/operations/services";

export const metadata = { title: "New operations task" };
export const dynamic = "force-dynamic";

export default async function NewOperationsTaskPage() {
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
          { label: "Tasks", href: "/dashboard/operations/tasks" },
          { label: "New" },
        ]}
        title="New task"
        description="Create an operations task. Assign it to dispatch the field workflow."
      />
      <DbStatusNotice />
      <TaskForm
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        appUsers={users.map((u) => ({ id: u.id, label: `${u.fullName} · ${u.email}` }))}
        templates={templates.map((t) => ({ id: t.id, label: t.name }))}
        cancelHref="/dashboard/operations/tasks"
      />
    </div>
  );
}
