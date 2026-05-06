import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getResidualUnit } from "@/lib/development/server/residual-inventory/residual-queries";

export const metadata: Metadata = {
  title: "Residual unit · Development OS",
};
export const dynamic = "force-dynamic";

function fmtUsd(b: bigint | string | number | null): string {
  if (b == null) return "—";
  const n = typeof b === "bigint" ? Number(b) : Number(b);
  return `$${(n / 100).toLocaleString("en-US")}`;
}

export default async function ResidualUnitDetailPage({
  params,
}: {
  params: Promise<{ unitId: string }>;
}) {
  const { unitId } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Residual unit" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const data = await getResidualUnit(unitId);
  if (!data) notFound();
  const { unit, shares } = data;

  const sumPct = shares.reduce(
    (acc, s) => acc + Number(s.ownershipPercentage),
    0,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          {
            label: "Residual inventory",
            href: "/development-os/residual-inventory",
          },
          { label: unit.unitId.slice(0, 8) },
        ]}
        eyebrow={`${unit.status} · valued ${fmtUsd(unit.activeValuationMinor)} (${unit.activeValuationMethod})`}
        title="Residual unit"
        description={unit.notes ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/residual-inventory">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              All residual units
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Valuations" title="All valuation methods (snapshot)">
        <Table>
          <THead>
            <TR>
              <TH>Method</TH>
              <TH>Value</TH>
              <TH>Active</TH>
            </TR>
          </THead>
          <TBody>
            {[
              ["list_price", unit.listPriceMinor],
              ["current_market_value", unit.currentMarketValueMinor],
              ["conservative_liquidation_value", unit.conservativeLiquidationValueMinor],
              ["internal_minimum_sale_price", unit.internalMinimumSalePriceMinor],
              ["rental_income_valuation", unit.rentalIncomeValuationMinor],
              ["manual_valuation", unit.manualValuationMinor],
            ].map(([method, value]) => (
              <TR key={String(method)}>
                <TD className="text-xs">{String(method)}</TD>
                <TDNum>{fmtUsd(value as bigint | null)}</TDNum>
                <TD>
                  {String(method) === unit.activeValuationMethod ? (
                    <Badge tone="success">active</Badge>
                  ) : (
                    "—"
                  )}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
        <p className="text-[11px] text-ink-tertiary mt-2">
          Active method: {unit.activeValuationMethod} · snapshot{" "}
          {fmtUsd(unit.activeValuationMinor)} as of {unit.activeValuationDate}
        </p>
      </Section>

      <Section
        eyebrow="Ownership"
        title={`Shares (${shares.length}) — sum check ${sumPct.toFixed(2)}%`}
      >
        {shares.length === 0 ? (
          <EmptyState
            title="No ownership shares allocated yet"
            description="Use allocateResidualOwnership server action with one of four settlement methods."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Owner</TH>
                <TH>Ownership %</TH>
                <TH>Economic claim</TH>
                <TH>Settlement method</TH>
                <TH>Approved</TH>
              </TR>
            </THead>
            <TBody>
              {shares.map((s) => (
                <TR key={s.id}>
                  <TD className="text-xs">
                    {s.arconiqueShare ? (
                      <Badge tone="info">Arconique</Badge>
                    ) : (
                      <span className="font-mono">
                        {s.investorId?.slice(0, 8) ?? "—"}
                      </span>
                    )}
                  </TD>
                  <TDNum>{Number(s.ownershipPercentage).toFixed(2)}%</TDNum>
                  <TDNum>{fmtUsd(s.economicClaimMinor)}</TDNum>
                  <TD className="text-xs">{s.settlementMethod}</TD>
                  <TD>
                    {s.isApproved ? (
                      <Badge tone="success">approved</Badge>
                    ) : (
                      <Badge tone="warning">pending</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <p className="text-[11px] text-ink-tertiary mt-2">
          DB trigger enforces ownership sums to exactly 100% per unit at COMMIT.
        </p>
      </Section>
    </DevelopmentShell>
  );
}
