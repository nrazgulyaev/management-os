import { notFound } from "next/navigation";
import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { updateStaffAction } from "@/features/payroll/actions";
import {
  getStaffById,
  listStaffAssignments,
  getOrgPayrollSettings,
} from "@/features/payroll/services";
import { StaffForm } from "../../staff-form";

export const metadata = { title: "Edit staff" };
export const dynamic = "force-dynamic";

export default async function EditStaffPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [member, villas, projects, assignments, settings] = await Promise.all([
    getStaffById(id),
    listVillas(),
    listProjects(),
    listStaffAssignments(id),
    getOrgPayrollSettings(),
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
        orgStatutoryEnabled={settings?.statutoryEnabled ?? false}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        defaults={{
          id: member.id,
          fullName: member.fullName,
          roleLabel: member.roleLabel,
          compMode: member.compMode as "salaried" | "per_villa_fixed" | "per_service",
          costBearer: member.costBearer as "owner" | "management" | "shared_pool",
          monthlyRateMinor: member.monthlyRateMinor,
          perVillaRateMinor: member.perVillaRateMinor,
          currency: member.currency,
          allocationScope: member.allocationScope as "villa" | "project_pool" | "company",
          villaId: member.villaId,
          projectId: member.projectId,
          active: member.active,
          notes: member.notes,
          hiredOn: member.hiredOn,
          endedOn: member.endedOn,
          rateEffectiveFrom: member.rateEffectiveFrom,
          statutoryEnabled: member.statutoryEnabled,
          ptkpStatus: member.ptkpStatus as
            | "TK/0"
            | "TK/1"
            | "TK/2"
            | "TK/3"
            | "K/0"
            | "K/1"
            | "K/2"
            | "K/3"
            | null,
          noNpwp: member.noNpwp,
          assignments: assignments
            .filter((a) => a.active)
            .map((a) => ({ villaId: a.villaId, projectId: a.projectId, weight: a.weight })),
        }}
      />
    </div>
  );
}
