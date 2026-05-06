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
import { listResidualUnits } from "@/lib/development/server/residual-inventory/residual-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Residual inventory · Development OS" };
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<string, "info" | "success" | "warning" | "neutral"> = {
  unsold: "warning",
  held: "info",
  transferred_to_management: "success",
  sold_later: "success",
  reallocated: "neutral",
};

function fmtUsd(b: bigint | string | number | null): string {
  if (b == null) return "—";
  const n = typeof b === "bigint" ? Number(b) : Number(b);
  return `$${(n / 100).toLocaleString("en-US")}`;
}

export default async function ResidualInventoryPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Residual inventory" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const units = await safeQuery("listResidualUnits", listResidualUnits(), [], 4000);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Residual inventory" },
        ]}
        eyebrow={`${units.length} residual unit${units.length === 1 ? "" : "s"}`}
        title="Residual inventory"
        description="Villas that became residual after project completion. Ownership shares between Arconique and investors are computed via one of four settlement methods (sum-to-100% per unit enforced by DB trigger)."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {units.length === 0 ? (
        <EmptyState
          title="No residual units yet"
          description="When a project completes without a full sellout, mark unsold villas as residual via the markUnitAsResidual server action."
        />
      ) : (
        <Section eyebrow="Catalog" title="All residual units">
          <Table>
            <THead>
              <TR>
                <TH>Unit</TH>
                <TH>Project</TH>
                <TH>Status</TH>
                <TH>Active valuation</TH>
                <TH>Method</TH>
                <TH>Became residual</TH>
              </TR>
            </THead>
            <TBody>
              {units.map((u) => (
                <TR key={u.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/residual-inventory/${u.id}`}
                      className="hover:underline"
                    >
                      {u.unitId.slice(0, 8)}
                    </Link>
                  </TD>
                  <TD className="font-mono text-xs">
                    {u.projectId.slice(0, 8)}
                  </TD>
                  <TD>
                    <Badge tone={STATUS_TONE[u.status] ?? "neutral"}>
                      {u.status}
                    </Badge>
                  </TD>
                  <TDNum>{fmtUsd(u.activeValuationMinor)}</TDNum>
                  <TD className="text-xs">{u.activeValuationMethod}</TD>
                  <TD className="text-xs">{u.becameResidualAt}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
