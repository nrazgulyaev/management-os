import { PageHeader } from "@/components/ui/page-header";
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
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Taxes" }]}
        title="Taxes"
        description="Local hospitality tax, VAT, withholding. Owner-visible by default unless explicitly hidden."
        actions={<TaxAddButton villas={villaOpts} projects={projectOpts} />}
      />
      <DbStatusNotice />
      <FinanceTable
        rows={rows.map((r) => ({
          id: r.id,
          date: r.taxDate,
          scope: r.villaId ?? "—",
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
