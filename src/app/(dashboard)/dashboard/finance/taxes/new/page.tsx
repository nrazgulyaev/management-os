import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { LedgerLineForm } from "@/components/finance/ledger-line-form";
import { createTaxLineAction } from "@/features/finance/actions";

export const metadata = { title: "New tax line" };
export const dynamic = "force-dynamic";

export default async function NewTaxPage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Taxes", href: "/dashboard/finance/taxes" },
          { label: "New" },
        ]}
        title="New tax line"
      />
      <DbStatusNotice />
      <LedgerLineForm
        title="Tax line"
        cancelHref="/dashboard/finance/taxes"
        action={createTaxLineAction}
        dateName="taxDate"
        dateLabel="Tax date"
        categoryName="taxType"
        categoryLabel="Tax type"
        categoryOptions={[
          "local_hospitality_tax",
          "vat",
          "income_tax_reserve",
          "withholding_tax",
          "platform_collected_tax",
          "other",
        ]}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        submitLabel="Post tax"
      />
    </div>
  );
}
