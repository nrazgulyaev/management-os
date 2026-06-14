import Link from "next/link";
import { Card } from "@/components/dashboard/primitives";
import {
  RebuildAllTransparencyButton,
  RebuildOwnerTransparencyForm,
} from "@/components/finance/transparency-buttons";

export const metadata = { title: "Statement transparency · rebuild" };
export const dynamic = "force-dynamic";

export default function ManualRebuildPage() {
  return (
    <div className="flex flex-col gap-10">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <Link href="/dashboard/finance/transparency">Transparency</Link> /{" "}
            <span>Rebuild</span>
          </div>
          <h1>Manual rebuild</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Use these forms to rebuild the transparency layer for a single owner
            or every recent statement. The cron job runs at 05:00 UTC daily.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">All statements</div>
        <Card padding="default">
          <p className="text-[13px] text-ink-3 mb-3">
            Default window: period_end within 120 days, statement status draft /
            issued / approved.
          </p>
          <RebuildAllTransparencyButton />
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">Per owner</div>
        <Card padding="default">
          <RebuildOwnerTransparencyForm />
        </Card>
      </div>
      <div>
        <div className="label mb-2.5">Per statement</div>
        <Card padding="default">
          <p className="text-[13px] text-ink-3 mb-3">
            Use the Rebuild button on the statement detail page or in the
            statements table to target a single statement.
          </p>
          <p className="text-xs text-ink-tertiary">
            The transparency layer is a derived view — wipe + reinsert is
            idempotent and does not affect accounting rows.
          </p>
        </Card>
      </div>
    </div>
  );
}
