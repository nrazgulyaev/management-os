import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { PayoutBatchForm } from "./form";

export const metadata = { title: "New payout batch" };
export const dynamic = "force-dynamic";

export default function NewPayoutBatchPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Payouts", href: "/dashboard/finance/payouts" },
          { label: "New batch" },
        ]}
        title="New payout batch"
        description="A batch groups individual payout lines. Lines persist independently — they can be added to a batch later."
      />
      <DbStatusNotice />
      <PayoutBatchForm />
    </div>
  );
}
