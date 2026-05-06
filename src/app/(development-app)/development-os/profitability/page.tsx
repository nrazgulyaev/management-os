import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listCurrentAllocations } from "@/lib/development/server/profitability/profitability-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Unit profitability · Development OS",
};
export const dynamic = "force-dynamic";

function formatMoney(minor: bigint | null | undefined, currency: string) {
  if (minor === null || minor === undefined) return "—";
  const n = Number(minor) / 100;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

function marginTone(
  pct: string | null | undefined,
): "success" | "info" | "warning" | "danger" | "neutral" {
  if (!pct) return "neutral";
  const v = Number(pct);
  if (Number.isNaN(v)) return "neutral";
  if (v >= 25) return "success";
  if (v >= 10) return "info";
  if (v >= 0) return "warning";
  return "danger";
}

export default async function ProfitabilityPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Unit profitability" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "listCurrentAllocations",
    listCurrentAllocations(100),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Unit profitability" },
        ]}
        eyebrow={`${rows.length} current allocations · Stage 5.B.3`}
        title="Unit profitability"
        description="Per-asset cost basis + expected margin. `total_cost_basis_minor` and `expected_margin_minor` are GENERATED STORED in Postgres, so the math is enforced at the storage layer. Recomputes are atomic — only one `is_current=true` row per asset, guarded by a partial unique index."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No allocations computed"
          description="Use the recomputeUnitAllocation server action or seed via scripts/seed-dev-os.mjs."
        />
      ) : (
        <Section eyebrow="Current basis" title="Per-unit cost + margin">
          <Table>
            <THead>
              <TR>
                <TH>Unit</TH>
                <TH>Type</TH>
                <TH className="text-right">Cost basis</TH>
                <TH className="text-right">Expected sale</TH>
                <TH className="text-right">Margin</TH>
                <TH>Margin %</TH>
                <TH>Computed</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="font-mono text-xs">{r.unitCode}</TD>
                  <TD className="text-xs">{r.assetTypeKey}</TD>
                  <TD className="text-right font-mono text-xs">
                    {formatMoney(r.totalCostBasisMinor, r.currency)}
                  </TD>
                  <TD className="text-right font-mono text-xs">
                    {formatMoney(r.expectedSalePriceMinor, r.currency)}
                  </TD>
                  <TD className="text-right font-mono text-xs">
                    {formatMoney(r.expectedMarginMinor, r.currency)}
                  </TD>
                  <TD>
                    {r.marginPercentage ? (
                      <Badge tone={marginTone(r.marginPercentage)}>
                        {Number(r.marginPercentage).toFixed(1)}%
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </TD>
                  <TD className="text-xs">
                    {new Date(r.computedAt).toISOString().slice(0, 10)}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
