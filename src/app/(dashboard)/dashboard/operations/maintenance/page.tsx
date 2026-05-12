import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { MaintenanceTicketCard } from "@/components/operations/maintenance-ticket-card";
import { MaintenanceAddButton } from "@/components/operations/maintenance-add-button";
import { listMaintenanceTickets } from "@/features/operations/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { OperationsRowActions } from "@/components/dashboard/operations/operations-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Operations · Maintenance" };
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const [tickets, villas, projects] = await Promise.all([
    listMaintenanceTickets({ limit: 200 }),
    listVillas(),
    listProjects(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Maintenance" },
        ]}
        title="Maintenance tickets"
        description="Reported issues, repair triage, and parts coordination."
        actions={<MaintenanceAddButton villas={villaOpts} projects={projectOpts} />}
      />
      <DbStatusNotice />
      <div className="flex flex-col gap-2">
        {tickets.length === 0 ? (
          <NoItemsYet
            entityLabel="maintenance tickets"
            description="Log your first maintenance ticket to start tracking repairs."
            addHref="/dashboard/operations/maintenance/new"
            addLabel="New ticket"
          />
        ) : (
          tickets.map((t) => (
            <div key={t.id} className="relative">
              <MaintenanceTicketCard
                ticket={t}
                href={`/dashboard/operations/maintenance/${t.id}`}
              />
              <div className="absolute top-3 right-3 z-10">
                <OperationsRowActions
                  kind="maintenance"
                  row={{
                    id: t.id,
                    displayName: t.title,
                    detailHref: `/dashboard/operations/maintenance/${t.id}`,
                    values: {
                      title: t.title,
                      description: t.description ?? "",
                      issueCategory: t.issueCategory,
                      severity: t.severity,
                      villaId: t.villaId ?? "",
                      projectId: t.projectId ?? "",
                      ownerChargeable: t.ownerChargeable,
                      estimatedCostMinor:
                        t.estimatedCostMinor != null
                          ? String(t.estimatedCostMinor)
                          : "",
                      currency: t.currency ?? "",
                    },
                  }}
                />
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
