import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { PeriodForm } from "./form";

export const metadata = { title: "New statement period" };
export const dynamic = "force-dynamic";

export default function NewPeriodPage() {
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Periods", href: "/dashboard/finance/periods" },
          { label: "New" },
        ]}
        title="New statement period"
        description="Defines an accounting window. Use month boundaries for monthly statements."
      />
      <DbStatusNotice />
      <PeriodForm />
      <p className="text-xs text-ink-tertiary">
        Need a quick example?{" "}
        <Link className="underline" href="/dashboard/finance/periods">
          Cancel
        </Link>{" "}
        and review existing periods.
      </p>
    </div>
  );
}
