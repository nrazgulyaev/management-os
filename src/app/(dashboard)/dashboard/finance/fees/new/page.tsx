import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { LedgerLineForm } from "@/components/finance/ledger-line-form";
import { createFeeLineAction } from "@/features/finance/actions";

export const metadata = { title: "New fee" };
export const dynamic = "force-dynamic";

export default async function NewFeePage() {
  const [villas, projects] = await Promise.all([listVillas(), listProjects()]);
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Fees", href: "/dashboard/finance/fees" },
          { label: "New" },
        ]}
        title="New fee line"
        description="OTA, payment, bank, FX, agent, manager — every commission is its own row, never bundled into expenses."
      />
      <DbStatusNotice />
      <LedgerLineForm
        title="Fee line"
        cancelHref="/dashboard/finance/fees"
        action={createFeeLineAction}
        dateName="feeDate"
        dateLabel="Fee date"
        categoryName="feeType"
        categoryLabel="Fee type"
        categoryOptions={[
          "ota_commission",
          "payment_processing",
          "bank_fee",
          "currency_conversion",
          "agent_commission",
          "manager_commission",
          "platform_subscription",
          "other",
        ]}
        villas={villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName}` }))}
        projects={projects.map((p) => ({ id: p.id, label: p.name }))}
        submitLabel="Post fee"
      />
    </div>
  );
}
