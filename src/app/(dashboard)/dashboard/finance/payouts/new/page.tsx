import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { PayoutBatchForm } from "./form";

export const metadata = { title: "New payout batch" };
export const dynamic = "force-dynamic";

export default function NewPayoutBatchPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/payouts">Payouts</Link> /{" "}
            <span>New batch</span>
          </div>
          <h1>New payout batch</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            A batch groups individual payout lines. Lines persist independently — they can be added to a batch later.
          </p>
        </div>
      </div>
      <DbStatusNotice />
      <PayoutBatchForm />
    </div>
  );
}
