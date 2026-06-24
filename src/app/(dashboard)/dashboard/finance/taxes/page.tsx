import Link from "next/link";
import { listTaxLines } from "@/features/finance/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { TaxAddButton } from "@/components/finance/tax-add-button";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Taxes" };
export const dynamic = "force-dynamic";

export default async function TaxesPage() {
  const [rows, villas, projects] = await Promise.all([
    listTaxLines(),
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
            <Link href="/dashboard/finance">Finance</Link> / <span>Taxes</span>
          </div>
          <h1>Taxes</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Local hospitality tax, VAT, withholding. Owner-visible by default
            unless explicitly hidden.
          </p>
        </div>
        <div className="actions">
          <TaxAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>
      <DbStatusNotice />
      <FinanceTable
        voidKind="tax"
        rows={rows.map((r) => ({
          id: r.id,
          date: r.taxDate,
          scope: r.villaCode ?? r.projectName ?? "—",
          category: r.taxType,
          description: r.description,
          amountMinor: r.amountMinor,
          currency: r.currency,
          status: r.status,
        }))}
      />
    </div>
  );
}
