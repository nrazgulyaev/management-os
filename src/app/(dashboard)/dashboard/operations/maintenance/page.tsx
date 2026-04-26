import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { DbStatusNotice } from "@/components/admin/db-status";
import { MaintenanceTicketCard } from "@/components/operations/maintenance-ticket-card";
import { listMaintenanceTickets } from "@/features/operations/services";

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
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No maintenance tickets yet.
          </p>
        ) : (
          tickets.map((t) => (
            <MaintenanceTicketCard
              key={t.id}
              ticket={t}
              href={`/dashboard/operations/maintenance/${t.id}`}
            />
          ))
        )}
      </div>
    </div>
  );
}
