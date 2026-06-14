import Link from "next/link";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Kpi, HandoffBadge } from "@/components/dashboard/primitives";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import {
  BridgePendingButton,
  BridgeOneUsageButton,
} from "@/components/finance/material-bridge-actions";
import { listMaterialUsageFinanceLinks } from "@/features/finance/material-usage-bridge";
import { getLastRunByJobKey } from "@/features/jobs/services";
import { LastRunBadge } from "@/components/jobs/last-run-badge";
import { formatMoneyMinor } from "@/lib/money";

export const metadata = { title: "Material usage · finance" };
export const dynamic = "force-dynamic";

const STATUS_TONES: Record<
  string,
  "soft" | "warn" | "info" | "ok" | "danger"
> = {
  pending: "warn",
  created: "ok",
  skipped_locked_period: "soft",
  skipped_not_chargeable: "soft",
  failed: "danger",
  reversed: "soft",
};

export default async function MaterialUsageBridgePage() {
  const [rows, lastBridgeRun] = await Promise.all([
    listMaterialUsageFinanceLinks({ limit: 200 }),
    getLastRunByJobKey("bridge_pending_material_usage"),
  ]);
  const created = rows.filter((r) => r.status === "created").length;
  const pending = rows.filter((r) => r.status === "pending").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return (
    <div className="flex flex-col gap-8">
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/finance">Finance</Link> /{" "}
            <span>Material usage</span>
          </div>
          <h1>Material usage → finance bridge</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Owner-chargeable items consumed on tasks materialise into expense_lines. Locked periods refuse new lines and are flagged here for finance to handle.
          </p>
        </div>
        <div className="actions">
          <BridgePendingButton />
        </div>
      </div>
      <DbStatusNotice />

      <LastRunBadge label="Last automatic bridge run" run={lastBridgeRun} />

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Created" value={String(created)} tone="success" />
        <Kpi label="Pending" value={String(pending)} tone="warn" />
        <Kpi label="Failed" value={String(failed)} tone="danger" />
      </div>

      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No material-usage rows have been bridged yet. Click &quot;Bridge pending usage&quot; once
          field staff start logging consumption.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Status</TH>
              <TH>Task</TH>
              <TH>Item</TH>
              <TH className="text-right">Qty</TH>
              <TH className="text-right">Amount</TH>
              <TH>Reason</TH>
              <TH>Action</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((r) => (
              <TR key={r.id}>
                <TD>
                  <HandoffBadge tone={STATUS_TONES[r.status] ?? "soft"}>
                    {r.status.replace(/_/g, " ")}
                  </HandoffBadge>
                </TD>
                <TD className="font-mono text-xs">{r.taskCode ?? "—"}</TD>
                <TD className="text-sm">{r.itemName}</TD>
                <TDNum>
                  {r.quantity} {r.itemUnit}
                </TDNum>
                <TDNum>
                  {r.unitCostMinor !== null && r.currency
                    ? formatMoneyMinor(
                        BigInt(Math.round(r.quantity * Number(r.unitCostMinor))),
                        r.currency,
                      )
                    : "—"}
                </TDNum>
                <TD className="text-xs text-ink-tertiary max-w-[280px] truncate">
                  {r.reason ?? "—"}
                </TD>
                <TD>
                  {(r.status === "pending" || r.status === "failed" || r.status === "skipped_locked_period") && (
                    <BridgeOneUsageButton usageId={r.usageId} />
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
