import Link from "next/link";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/operations">Operations</Link> /{" "}
            <Link href="/dashboard/operations/maintenance">Maintenance</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New maintenance ticket</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Open a maintenance ticket. The repair workflow can be promoted to a generated task.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <MaintenanceTicketForm
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        cancelHref="/dashboard/operations/maintenance"
      />
    </div>
  );
}
