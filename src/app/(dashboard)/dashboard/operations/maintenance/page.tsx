import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { MaintenanceTicketCard } from "@/components/operations/maintenance-ticket-card";
import { listMaintenanceTickets } from "@/features/operations/services";
import { OperationsRowActions } from "@/components/dashboard/operations/operations-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Operations · Maintenance" };
export const dynamic = "force-dynamic";

export default async function MaintenancePage() {
  const tickets = await listMaintenanceTickets({ limit: 200 });
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Operations", href: "/dashboard/operations" },
          { label: "Maintenance" },
        ]}
        title="Maintenance tickets"
        description="Reported issues, repair triage, and parts coordination."
        actions={
          <Button asChild>
            <Link href="/dashboard/operations/maintenance/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New ticket
            </Link>
          </Button>
        }
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
