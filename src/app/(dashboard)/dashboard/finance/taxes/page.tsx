import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { listTaxLines } from "@/features/finance/services";
import { FinanceTable } from "@/components/finance/finance-table";
import { DbStatusNotice } from "@/components/admin/db-status";

export const metadata = { title: "Taxes" };
export const dynamic = "force-dynamic";

export default async function TaxesPage() {
  const rows = await listTaxLines();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[{ label: "Finance", href: "/dashboard/finance" }, { label: "Taxes" }]}
        title="Taxes"
        description="Local hospitality tax, VAT, withholding. Owner-visible by default unless explicitly hidden."
        actions={
          <Button asChild>
            <Link href="/dashboard/finance/taxes/new">
              <Plus className="w-4 h-4" strokeWidth={1.75} />
              New tax line
            </Link>
          </Button>
        }
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
