import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { createStaffAction } from "@/features/payroll/actions";
import { getOrgPayrollSettings } from "@/features/payroll/services";
import { StaffForm } from "../staff-form";

export const metadata = { title: "Add staff" };
export const dynamic = "force-dynamic";

export default async function NewStaffPage() {
  const [villas, projects, settings] = await Promise.all([
    listVillas(),
    listProjects(),
    getOrgPayrollSettings(),
  ]);
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/payroll">Payroll</Link> /{" "}
            <span>Add staff</span>
          </div>
          <h1>Add staff member</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Record who costs what + how their cost should be allocated. Payroll
            runs turn this into expense lines.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <StaffForm
        mode="create"
        action={createStaffAction}
        cancelHref="/dashboard/payroll"
        orgStatutoryEnabled={settings?.statutoryEnabled ?? false}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
      />
    </div>
  );
}
