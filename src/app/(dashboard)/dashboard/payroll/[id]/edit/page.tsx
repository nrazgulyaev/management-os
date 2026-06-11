import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { updateStaffAction } from "@/features/payroll/actions";
import { getStaffById } from "@/features/payroll/services";
import { StaffForm } from "../../staff-form";

export const metadata = { title: "Edit staff" };
export const dynamic = "force-dynamic";

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [member, villas, projects] = await Promise.all([
    getStaffById(id),
    listVillas(),
    listProjects(),
  ]);
  if (!member) notFound();

  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Payroll", href: "/dashboard/payroll" },
          { label: member.fullName },
        ]}
        title="Edit staff member"
        description="Update the rate or allocation. Changes apply to the next payroll run; already-posted runs are unchanged."
      />
      <DbStatusNotice />
      <StaffForm
        mode="edit"
        action={updateStaffAction}
        cancelHref="/dashboard/payroll"
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        defaults={{
          id: member.id,
          fullName: member.fullName,
          roleLabel: member.roleLabel,
          monthlyRateMinor: member.monthlyRateMinor,
          currency: member.currency,
          allocationScope: member.allocationScope as "villa" | "project_pool" | "company",
          villaId: member.villaId,
          projectId: member.projectId,
          active: member.active,
          notes: member.notes,
        }}
      />
    </div>
  );
}
