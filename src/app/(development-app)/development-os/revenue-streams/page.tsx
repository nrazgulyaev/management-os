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
import { listRevenueStreams } from "@/lib/development/server/revenue-streams/revenue-stream-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Revenue streams · Development OS" };
export const dynamic = "force-dynamic";

function formatMoney(minor: bigint | null | undefined, currency: string) {
  if (minor === null || minor === undefined) return "—";
  const n = Number(minor) / 100;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

export default async function RevenueStreamsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string }>;
}) {
  const params = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Revenue streams" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const streams = await safeQuery(
    "listRevenueStreams",
    listRevenueStreams({ streamType: params.type }),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Revenue streams" },
        ]}
        eyebrow={`${streams.length} entries · Stage 5.B.1`}
        title="Revenue streams"
        description="Per-period gross + net revenue by asset. `net_revenue_minor` is computed in Postgres as `gross - direct_costs` (GENERATED STORED) so it's always consistent."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      {streams.length === 0 ? (
        <EmptyState
          title="No revenue streams logged"
          description="Generate via scripts/seed-dev-os.mjs or insert through the operator action."
        />
      ) : (
        <Section eyebrow="Recent" title="Revenue streams (latest period first)">
          <Table>
            <THead>
              <TR>
                <TH>Period</TH>
                <TH>Stream</TH>
                <TH>Asset</TH>
                <TH className="text-right">Gross</TH>
                <TH className="text-right">Direct cost</TH>
                <TH className="text-right">Net</TH>
                <TH>Source</TH>
              </TR>
            </THead>
            <TBody>
              {streams.map((s) => (
                <TR key={s.id}>
                  <TD className="text-xs">
                    {s.periodStart} → {s.periodEnd}
                  </TD>
                  <TD>
                    <Badge tone="info">{s.streamType}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">
                    {s.assetId.slice(0, 8)}
                  </TD>
                  <TD className="text-right font-mono text-xs">
                    {formatMoney(s.grossRevenueMinor, s.currency)}
                  </TD>
                  <TD className="text-right font-mono text-xs">
                    {formatMoney(s.directCostsMinor, s.currency)}
                  </TD>
                  <TD className="text-right font-mono text-xs">
                    {formatMoney(s.netRevenueMinor, s.currency)}
                  </TD>
                  <TD className="text-xs">{s.dataSource ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </Section>
      )}
    </DevelopmentShell>
  );
}
