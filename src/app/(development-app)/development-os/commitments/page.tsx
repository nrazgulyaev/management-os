import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Kpi, Card } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getCommitments } from "@/lib/development/server/investors";
import {
  COMMITMENT_STATUS_LABEL,
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Commitments · Development OS" };
export const dynamic = "force-dynamic";

/** Abbreviated USD for KPI tiles — `$12.4M` / `$1.1M`, matching the mockup. */
function fmtAbbrevUsd(minor: bigint): string {
  const usd = Number(minor) / 100;
  if (usd >= 1_000_000) return `$${(usd / 1_000_000).toFixed(1)}M`;
  if (usd >= 1_000) return `$${Math.round(usd / 1_000)}K`;
  return `$${Math.round(usd)}`;
}

export default async function CommitmentsPage() {
  const db = getDb();

  const commitments = db
    ? await safeQuery(
        "getCommitments",
        getCommitments({}),
        [] as Awaited<ReturnType<typeof getCommitments>>,
        4000,
      )
    : [];

  const totalCommittedUsd = commitments.reduce(
    (acc, c) => acc + BigInt(c.committedAmountUsdMinor),
    0n,
  );
  const totalDrawnUsd = commitments.reduce(
    (acc, c) => acc + BigInt(c.drawnUsdMinor),
    0n,
  );
  const totalWalletUsd = commitments.reduce(
    (acc, c) => acc + BigInt(c.walletAvailableUsdMinor),
    0n,
  );
  const drawnPct =
    totalCommittedUsd > 0n
      ? Math.round((Number(totalDrawnUsd) / Number(totalCommittedUsd)) * 100)
      : 0;
  // Capital-weighted average profit-share %.
  const committedUsdNum = Number(totalCommittedUsd);
  const avgProfitPct =
    committedUsdNum > 0
      ? commitments.reduce(
          (acc, c) =>
            acc +
            Number(c.profitSharePercent) *
              (Number(c.committedAmountUsdMinor) / committedUsdNum),
          0,
        )
      : 0;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Commitments" },
        ]}
        eyebrow="Capital · one row per investor × project"
        title="Capital commitments"
        description="Each commitment carries its own profit-share % and capital-return priority. Drawdowns and wallets nest under the detail view."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="accent">
              <Link href="/development-os/commitments">+ New commitment</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {!db && (
        <EmptyState
          title="Commitments need the database"
          description="Database connection not configured. Contact support."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      )}

      {db && (
        <>
          <div className="projects-kpi-strip">
            <Kpi
              label="Committed"
              value={fmtAbbrevUsd(totalCommittedUsd)}
              sub={`${commitments.length} commitments`}
              tone="accent"
            />
            <Kpi
              label="Drawn"
              value={fmtAbbrevUsd(totalDrawnUsd)}
              sub={`${drawnPct}% called`}
            />
            <Kpi
              label="In wallets"
              value={fmtAbbrevUsd(totalWalletUsd)}
              sub="available"
              tone="success"
            />
            <Kpi
              label="Avg profit %"
              value={`${avgProfitPct.toFixed(1)}%`}
              sub="weighted"
            />
          </div>

          <Card padding="default" overflowHidden>
            <div className="flex items-center gap-2.5 mb-3.5">
              <h3 className="display text-[19px] font-medium tracking-tight m-0">
                Active + closed
              </h3>
              <span className="label ml-auto text-[10.5px] tracking-[0.04em]">
                {commitments.length} commitments
              </span>
            </div>
            {commitments.length === 0 ? (
              <EmptyState
                title="No commitments yet"
                description="Add your first investor commitment to start tracking capital calls and distributions."
                action={
                  <Link
                    href="/development-os/commitments"
                    className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40"
                  >
                    View commitments
                  </Link>
                }
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="data w-full">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Investor</th>
                      <th>Project</th>
                      <th className="num">Committed</th>
                      <th className="num">Profit %</th>
                      <th className="num">Drawn %</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commitments.map((c) => (
                      <tr key={c.id}>
                        <td className="font-mono text-[11px]">
                          <Link
                            href={`/development-os/commitments/${c.id}`}
                            className="hover:underline"
                          >
                            {c.commitmentCode}
                          </Link>
                        </td>
                        <td>
                          <Link
                            href={`/development-os/investors/${c.investorCode}`}
                            className="hover:underline text-ink"
                          >
                            {c.investorLegalName}
                          </Link>
                        </td>
                        <td className="text-ink-secondary">
                          {c.projectName ?? (
                            <span className="text-ink-4">Multi-project</span>
                          )}
                        </td>
                        <td className="num">
                          {formatCurrencyMinor(
                            BigInt(c.committedAmountMinor),
                            c.committedCurrency,
                          )}
                          <div className="text-[10px] text-ink-tertiary">
                            ≈ {formatUsdMinor(BigInt(c.committedAmountUsdMinor))}
                          </div>
                        </td>
                        <td className="num">
                          {Number(c.profitSharePercent).toFixed(1)}%
                        </td>
                        <td className="num">{c.drawnPercent.toFixed(1)}%</td>
                        <td>
                          <Badge
                            tone={
                              c.status === "active"
                                ? "success"
                                : c.status === "fully_called"
                                  ? "info"
                                  : c.status === "closed"
                                    ? "neutral"
                                    : "warning"
                            }
                          >
                            {COMMITMENT_STATUS_LABEL[c.status]}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </DevelopmentShell>
  );
}
