import Link from "next/link";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> / <span>Reserves</span>
          </div>
          <h1>Reserve movements</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Renovation, FF&E / depreciation, maintenance, tax, emergency.
            Contributions accrue against the villa or project; releases reduce
            the balance.
          </p>
        </div>
        <div className="actions">
          <ReserveAddButton villas={villaOpts} projects={projectOpts} owners={ownerOpts} />
        </div>
      </div>
      <DbStatusNotice />
      <FinanceTable
        voidKind="reserve"
        rows={rows.map((r) => ({
          id: r.id,
          date: r.movementDate,
          scope: r.villaCode ?? r.projectName ?? "—",
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
