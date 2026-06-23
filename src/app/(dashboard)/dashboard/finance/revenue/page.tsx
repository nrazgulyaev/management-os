import Link from "next/link";
import { listRevenueLines } from "@/features/finance/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { RevenueAddButton } from "@/components/finance/revenue-add-button";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Revenue ledger" };
export const dynamic = "force-dynamic";

export default async function RevenuePage() {
  const [rows, villas, projects] = await Promise.all([
    listRevenueLines(),
    listVillas(),
    listProjects(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> / <span>Revenue</span>
          </div>
          <h1>Revenue ledger</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Booking-attributed revenue, extra services, refunds. Each row maps
            to a statement line at month end.
          </p>
        </div>
        <div className="actions">
          <RevenueAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>
      <DbStatusNotice />
      <FinanceTable
        voidKind="revenue"
        rows={rows.map((r) => ({
          id: r.id,
          date: r.serviceDate,
          scope: r.villaCode ?? r.projectName ?? "—",
          category: r.revenueType,
          description: r.description,
          amountMinor: r.amountMinor,
          currency: r.currency,
          status: r.status,
        }))}
      />
    </div>
  );
}
