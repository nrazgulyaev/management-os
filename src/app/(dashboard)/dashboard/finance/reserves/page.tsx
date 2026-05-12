import { PageHeader } from "@/components/ui/page-header";
import { listReserveMovements } from "@/features/finance/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { listOwners } from "@/features/owners/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { ReserveAddButton } from "@/components/finance/reserve-add-button";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Reserves" };
export const dynamic = "force-dynamic";

export default async function ReservesPage() {
  const [rows, villas, projects, owners] = await Promise.all([
    listReserveMovements(),
    listVillas(),
    listProjects(),
    listOwners(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  const ownerOpts = owners.map((o) => ({ id: o.id, label: o.displayName }));
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Reserves" }]}
        title="Reserve movements"
        description="Renovation, FF&E / depreciation, maintenance, tax, emergency. Contributions accrue against the villa or project; releases reduce the balance."
        actions={<ReserveAddButton villas={villaOpts} projects={projectOpts} owners={ownerOpts} />}
      />
      <DbStatusNotice />
      <FinanceTable
        rows={rows.map((r) => ({
          id: r.id,
          date: r.movementDate,
          scope: r.villaId ?? r.projectId ?? "—",
          category: `${r.reserveType} · ${r.movementType}`,
          description: r.description,
          amountMinor: r.amountMinor,
          currency: r.currency,
          status: r.status,
        }))}
      />
    </div>
  );
}
