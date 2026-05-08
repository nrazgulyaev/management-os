import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listApprovalThresholds } from "@/lib/development/server/procurement/procurement-actions";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Approval thresholds · Development OS",
};
export const dynamic = "force-dynamic";

const ROLE_TONE: Record<string, "info" | "success" | "warning" | "danger" | "neutral"> = {
  auto_approved: "success",
  procurement_manager: "info",
  project_manager: "info",
  finance_manager: "info",
  director: "warning",
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
        <PageHeader title="Approval thresholds" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings" },
          { label: "Approval thresholds" },
        ]}
        eyebrow={`${thresholds.length} active thresholds across ${byType.size} types`}
        title="Approval thresholds matrix"
        description="Operator-configurable approval matrix per threshold type × amount tier × required role. Re-checked in code at every approve action via lib/development/server/procurement/approval-helpers.ts (defense in depth)."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {thresholds.length === 0 ? (
        <EmptyState
          title="No thresholds configured"
          description="Approval thresholds are missing. Contact support to restore the default configuration."
        />
      ) : (
        Array.from(byType.entries()).map(([type, rows]) => (
          <Section
            key={type}
            eyebrow={type}
            title={`${rows.length} tier${rows.length === 1 ? "" : "s"}`}
          >
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
                      <Badge tone={ROLE_TONE[r.requiredRole] ?? "neutral"}>
                        {r.requiredRole}
                      </Badge>
                    </TD>
                    <TDNum>{r.requiredApproverCount}</TDNum>
                    <TD className="text-xs">{r.notes ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </Section>
        ))
      )}
    </DevelopmentShell>
  );
}
