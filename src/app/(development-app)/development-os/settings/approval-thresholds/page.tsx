import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listApprovalThresholds } from "@/lib/development/server/procurement/procurement-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Approval thresholds · Development OS",
};
export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  auto_approved: "ok",
  procurement_manager: "info",
  project_manager: "info",
  finance_manager: "info",
  director: "warn",
  investor_approval: "danger",
  reserved_matter: "danger",
};

function fmtUsd(b: bigint | string | number | null): string {
  if (b == null) return "no limit";
  const n = typeof b === "bigint" ? Number(b) : Number(b);
  return `$${(n / 100).toLocaleString("en-US")}`;
}

export default async function ApprovalThresholdsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <span>Settings</span> / <span>Approval thresholds</span>
            </div>
            <h1>Approval thresholds</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const thresholds = await safeQuery(
    "listApprovalThresholds",
    listApprovalThresholds(),
    [],
    4000,
  );

  // Group by threshold_type.
  const byType = new Map<string, typeof thresholds>();
  for (const t of thresholds) {
    const arr = byType.get(t.thresholdType) ?? [];
    arr.push(t);
    byType.set(t.thresholdType, arr);
  }

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Settings</span> / <span>Approval thresholds</span>
          </div>
          <h1>Approval thresholds matrix</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Operator-configurable approval matrix per threshold type × amount
            tier × required role. Re-checked in code at every approve action via
            lib/development/server/procurement/approval-helpers.ts (defense in
            depth).
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      {thresholds.length === 0 ? (
        <EmptyState
          title="No thresholds configured"
          description="Approval thresholds are missing. Contact support to restore the default configuration."
        />
      ) : (
        Array.from(byType.entries()).map(([type, rows]) => (
          <div key={type}>
            <div className="label mb-2.5">{type}</div>
            <p className="text-[13px] text-ink-3 mb-2.5">
              {rows.length} tier{rows.length === 1 ? "" : "s"}
            </p>
            <Table>
              <THead>
                <TR>
                  <TH>Min</TH>
                  <TH>Max</TH>
                  <TH>Currency</TH>
                  <TH>Required role</TH>
                  <TH>Approver count</TH>
                  <TH>Notes</TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((r) => (
                  <TR key={r.id}>
                    <TDNum>{fmtUsd(r.amountMinorMin)}</TDNum>
                    <TDNum>{fmtUsd(r.amountMinorMax)}</TDNum>
                    <TD className="text-xs">{r.currency}</TD>
                    <TD>
                      <HandoffBadge tone={ROLE_TONE[r.requiredRole] ?? "soft"}>
                        {r.requiredRole}
                      </HandoffBadge>
                    </TD>
                    <TDNum>{r.requiredApproverCount}</TDNum>
                    <TD className="text-xs">{r.notes ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ))
      )}
    </DevelopmentShell>
  );
}
