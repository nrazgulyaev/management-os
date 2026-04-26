import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Badge } from "@/components/ui/badge";
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
  "neutral" | "warning" | "info" | "success" | "danger"
> = {
  pending: "warning",
  created: "success",
  skipped_locked_period: "neutral",
  skipped_not_chargeable: "neutral",
  failed: "danger",
  reversed: "neutral",
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
      <PageHeader
        breadcrumbs={[
          { label: "Finance", href: "/dashboard/finance" },
          { label: "Material usage" },
        ]}
        title="Material usage → finance bridge"
        description="Owner-chargeable items consumed on tasks materialise into expense_lines. Locked periods refuse new lines and are flagged here for finance to handle."
        actions={<BridgePendingButton />}
      />
      <DbStatusNotice />

      <LastRunBadge label="Last automatic bridge run" run={lastBridgeRun} />

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Created" value={String(created)} tone="success" />
        <Stat label="Pending" value={String(pending)} tone="warning" />
        <Stat label="Failed" value={String(failed)} tone="danger" />
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
                  <Badge tone={STATUS_TONES[r.status] ?? "neutral"}>
                    {r.status.replace(/_/g, " ")}
                  </Badge>
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "success" | "warning" | "danger";
}) {
  const cls =
    tone === "success"
      ? "border-success/30 bg-success-weak/30"
      : tone === "warning"
        ? "border-warning/30 bg-warning-weak/30"
        : "border-danger/30 bg-danger-weak/30";
  return (
    <div className={`rounded-md border ${cls} p-4`}>
      <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">{label}</div>
      <div className="text-xl font-mono tabular-nums text-ink mt-1">{value}</div>
    </div>
  );
}
