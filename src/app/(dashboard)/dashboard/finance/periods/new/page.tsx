import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { PeriodForm } from "./form";

export const metadata = { title: "New statement period" };
export const dynamic = "force-dynamic";

export default function NewPeriodPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/periods">Periods</Link> /{" "}
            <span>New</span>
          </div>
          <h1>New statement period</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Defines an accounting window. Use month boundaries for monthly statements.
          </p>
        </div>
      </div>
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
