import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
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
        <div className="page-header">
          <div className="left">
            <h1>Residual unit</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/residual-inventory">
              Residual inventory
            </Link>{" "}
            / <span>{unit.unitId.slice(0, 8)}</span>
          </div>
          <h1>Residual unit</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            {unit.status} · valued {fmtUsd(unit.activeValuationMinor)} (
            {unit.activeValuationMethod})
          </p>
          {unit.notes && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {unit.notes}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href="/development-os/residual-inventory"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All residual units
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Valuations</div>
        <Card padding="none" overflowHidden>
          <table className="data">
            <thead>
              <tr>
                <th scope="col">Method</th>
                <th scope="col" className="num">Value</th>
                <th scope="col">Active</th>
              </tr>
            </thead>
            <tbody>
              {[
                ["list_price", unit.listPriceMinor],
                ["current_market_value", unit.currentMarketValueMinor],
                ["conservative_liquidation_value", unit.conservativeLiquidationValueMinor],
                ["internal_minimum_sale_price", unit.internalMinimumSalePriceMinor],
                ["rental_income_valuation", unit.rentalIncomeValuationMinor],
                ["manual_valuation", unit.manualValuationMinor],
              ].map(([method, value]) => (
                <tr key={String(method)}>
                  <td className="text-xs">{String(method)}</td>
                  <td className="num">{fmtUsd(value as bigint | null)}</td>
                  <td>
                    {String(method) === unit.activeValuationMethod ? (
                      <HandoffBadge tone="ok">active</HandoffBadge>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <p className="text-[11px] text-ink-tertiary mt-2">
          Active method: {unit.activeValuationMethod} · snapshot{" "}
          {fmtUsd(unit.activeValuationMinor)} as of {unit.activeValuationDate}
        </p>
      </div>

      <div>
        <div className="label mb-2.5">Ownership</div>
        <p className="text-[13px] text-ink-3 mb-2.5">
          Shares ({shares.length}) — sum check {sumPct.toFixed(2)}%
        </p>
        {shares.length === 0 ? (
          <EmptyState
            title="No ownership shares allocated yet"
            description="Use allocateResidualOwnership server action with one of four settlement methods."
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Owner</th>
                  <th scope="col" className="num">Ownership %</th>
                  <th scope="col" className="num">Economic claim</th>
                  <th scope="col">Settlement method</th>
                  <th scope="col">Approved</th>
                </tr>
              </thead>
              <tbody>
                {shares.map((s) => (
                  <tr key={s.id}>
                    <td className="text-xs">
                      {s.arconiqueShare ? (
                        <HandoffBadge tone="info">Arconique</HandoffBadge>
                      ) : (
                        <span className="mono">
                          {s.investorId?.slice(0, 8) ?? "—"}
                        </span>
                      )}
                    </td>
                    <td className="num">{Number(s.ownershipPercentage).toFixed(2)}%</td>
                    <td className="num">{fmtUsd(s.economicClaimMinor)}</td>
                    <td className="text-xs">{s.settlementMethod}</td>
                    <td>
                      {s.isApproved ? (
                        <HandoffBadge tone="ok">approved</HandoffBadge>
                      ) : (
                        <HandoffBadge tone="warn">pending</HandoffBadge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
        <p className="text-[11px] text-ink-tertiary mt-2">
          DB trigger enforces ownership sums to exactly 100% per unit at COMMIT.
        </p>
      </div>
    </DevelopmentShell>
  );
}
