import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { createStaffAction } from "@/features/payroll/actions";
import { StaffForm } from "../staff-form";

export const metadata = { title: "Add staff" };
export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Payroll", href: "/dashboard/payroll" },
          { label: "Add staff" },
        ]}
        title="Add staff member"
        description="Record who costs what + how their cost should be allocated. Payroll runs turn this into expense lines."
      />
      <DbStatusNotice />
      <StaffForm
        mode="create"
        action={createStaffAction}
        cancelHref="/dashboard/payroll"
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
