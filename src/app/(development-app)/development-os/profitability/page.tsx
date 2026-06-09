import type { Metadata } from "next";
import Link from "next/link";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listCurrentAllocations } from "@/lib/development/server/profitability/profitability-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { RecomputeButton } from "./_recompute-button";

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
): "ok" | "info" | "warn" | "danger" {
  if (!pct) return "info";
  const v = Number(pct);
  if (Number.isNaN(v)) return "info";
  if (v >= 25) return "ok";
  if (v >= 10) return "info";
  if (v >= 0) return "warn";
  return "danger";
}

export default async function ProfitabilityPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> / Unit
              profitability
            </div>
            <h1>Unit profitability.</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const rows = await safeQuery(
    "listCurrentAllocations",
    listCurrentAllocations(100),
    [],
    4000,
  );

  // KPI strip derived from the live allocation rows (margin math is
  // GENERATED STORED in Postgres — read-only here, no recompute).
  const margins = rows
    .map((r) => Number(r.marginPercentage))
    .filter((n) => !Number.isNaN(n));
  const avgMargin =
    margins.length > 0
      ? margins.reduce((a, b) => a + b, 0) / margins.length
      : null;
  const best = rows.reduce<(typeof rows)[number] | null>((hi, r) => {
    const v = Number(r.marginPercentage);
    if (Number.isNaN(v)) return hi;
    if (hi === null || v > Number(hi.marginPercentage)) return r;
    return hi;
  }, null);
  const belowTen = margins.filter((n) => n < 10).length;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> / Unit
            profitability
          </div>
          <h1>
            Unit <em>profitability</em>.
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Per-asset cost basis + expected margin. Cost basis and margin are
            GENERATED STORED in Postgres — the math is enforced at the storage
            layer. One current row per asset, guarded by a partial unique index.
          </p>
        </div>
        <div className="actions">
          <span className="chip">GENERATED STORED · enforced at DB</span>
          <RecomputeButton />
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            Command center
          </Link>
        </div>
      </div>

      <div className="cfo-kpis cfo-kpis-4">
        <Kpi
          label="Units tracked"
          value={rows.length}
          sub="current allocations"
        />
        <Kpi
          label="Avg margin"
          value={avgMargin === null ? "—" : `${avgMargin.toFixed(1)}%`}
          sub="expected"
          tone="success"
        />
        <Kpi
          label="Best unit"
          value={
            best?.marginPercentage
              ? `${Number(best.marginPercentage).toFixed(0)}%`
              : "—"
          }
          sub={best?.unitCode ?? "—"}
          tone="accent"
        />
        <Kpi
          label="Below 10%"
          value={belowTen}
          sub="review pricing"
          tone="warn"
        />
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No allocations computed"
          description="Press Recompute to roll the dev budget + actuals into per-asset cost allocations, or seed via scripts/seed-dev-os.mjs."
        />
      ) : (
        <Card padding="default">
          <div className="cfo-card-head">
            <h3 className="cfo-card-title">Per-unit cost + margin</h3>
            <span className="label">{rows.length} allocations</span>
          </div>
          <table className="data">
            <thead>
              <tr>
                <th>Unit</th>
                <th>Type</th>
                <th className="num">Cost basis</th>
                <th className="num">Expected sale</th>
                <th className="num">Margin</th>
                <th>Margin %</th>
                <th>Computed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const marginNeg =
                  r.expectedMarginMinor !== null &&
                  r.expectedMarginMinor !== undefined &&
                  Number(r.expectedMarginMinor) < 0;
                return (
                  <tr key={r.id}>
                    <td className="mono">{r.unitCode}</td>
                    <td className="text-[var(--ink-3)]">{r.assetTypeKey}</td>
                    <td className="num">
                      {formatMoney(r.totalCostBasisMinor, r.currency)}
                    </td>
                    <td className="num">
                      {formatMoney(r.expectedSalePriceMinor, r.currency)}
                    </td>
                    <td
                      className={
                        "num" + (marginNeg ? " text-[var(--danger)]" : "")
                      }
                    >
                      {formatMoney(r.expectedMarginMinor, r.currency)}
                    </td>
                    <td>
                      {r.marginPercentage ? (
                        <HandoffBadge tone={marginTone(r.marginPercentage)}>
                          {Number(r.marginPercentage).toFixed(1)}%
                        </HandoffBadge>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="text-[var(--ink-3)]">
                      {new Date(r.computedAt).toISOString().slice(0, 10)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </DevelopmentShell>
  );
}
