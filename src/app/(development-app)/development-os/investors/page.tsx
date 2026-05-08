import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Briefcase } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { MetricCard } from "@/components/ui/metric-card";
import { getDb } from "@/lib/db/client";
import {
  getInvestors,
  getInvestorMetrics,
} from "@/lib/development/server/investors";
import {
  INVESTOR_TYPE_LABEL,
  INVESTOR_STATUS_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import {
  logSafeQueryTimings,
  safeQuery,
  type SafeQueryTiming,
} from "@/lib/development/safe-query";
import { InvestorModalForm } from "@/components/development/investors/investor-modal-form";
import { ExportButton } from "@/components/development/bulk-import/export-button";

export const metadata: Metadata = { title: "Investors · Development OS" };
export const dynamic = "force-dynamic";

const EMPTY_METRICS = {
  totalInvestors: 0,
  byType: {
    gp: 0,
    lp_private: 0,
    lp_institutional: 0,
    landowner_jv: 0,
  } as Record<
    "gp" | "lp_private" | "lp_institutional" | "landowner_jv",
    number
  >,
  byStatus: { active: 0, inactive: 0, exited: 0 } as Record<
    "active" | "inactive" | "exited",
    number
  >,
  totalCommittedUsdMinor: "0",
  totalDrawnUsdMinor: "0",
  totalDistributedUsdMinor: "0",
  totalWalletAvailableUsdMinor: "0",
};

export default async function InvestorsPage() {
  const db = getDb();
  const timings: SafeQueryTiming[] = [];
  const onTiming = (t: SafeQueryTiming) => timings.push(t);

  let investors: Awaited<ReturnType<typeof getInvestors>> = [];
  let metrics = EMPTY_METRICS;

  if (db) {
    [investors, metrics] = await Promise.all([
      safeQuery("getInvestors", getInvestors(), [], 4000, onTiming),
      safeQuery(
        "getInvestorMetrics",
        getInvestorMetrics(),
        EMPTY_METRICS,
        4000,
        onTiming,
      ),
    ]);
  }

  logSafeQueryTimings("investors", timings);
  const degraded = timings.filter((t) => t.usedFallback).map((t) => t.label);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Investors" },
        ]}
        eyebrow={
          db
            ? `${metrics.totalInvestors} investors · ${formatUsdMinor(BigInt(metrics.totalCommittedUsdMinor))} committed`
            : "Database not configured"
        }
        title="Investors"
        description="Pre-handover capital partners. Each investor can hold one or more commitments across projects with negotiated profit-share and capital-return priority."
        actions={
          <div className="flex items-center gap-2">
            <InvestorModalForm />
            <ExportButton entity="investors" />
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
          title="Investors module needs the database"
          description="Database connection not configured. Contact support."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      )}

      {db && degraded.length > 0 && (
        <div className="rounded-lg border border-amber-300/60 bg-amber-50/80 px-4 py-3 text-sm text-amber-900">
          <div className="font-medium">Some investor data is unavailable</div>
          <div className="text-xs text-amber-800/80 mt-1">
            Affected: {degraded.join(", ")}. Refresh in a moment.
          </div>
        </div>
      )}

      {db && (
        <>
          <Section eyebrow="Capital snapshot" title="At a glance">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Total committed"
                value={formatUsdMinor(BigInt(metrics.totalCommittedUsdMinor))}
                hint={`${metrics.totalInvestors} investors`}
              />
              <MetricCard
                label="Total drawn"
                value={formatUsdMinor(BigInt(metrics.totalDrawnUsdMinor))}
                hint="Capital received from investors"
              />
              <MetricCard
                label="Distributed"
                value={formatUsdMinor(BigInt(metrics.totalDistributedUsdMinor))}
                hint="Capital + profit attributed"
              />
              <MetricCard
                label="In wallets"
                value={formatUsdMinor(
                  BigInt(metrics.totalWalletAvailableUsdMinor),
                )}
                hint="Available, not yet withdrawn"
              />
            </div>
          </Section>

          <Section eyebrow="Investors" title="All investors">
            {investors.length === 0 ? (
              <EmptyState
                title="No investors yet"
                description="Add your first investor to start tracking commitments and distributions."
                action={
                  <Badge tone="neutral" className="gap-1">
                    <Briefcase className="w-3 h-3" />
                    {INVESTOR_TYPE_LABEL.gp}, {INVESTOR_TYPE_LABEL.lp_private},{" "}
                    {INVESTOR_TYPE_LABEL.lp_institutional},{" "}
                    {INVESTOR_TYPE_LABEL.landowner_jv}
                  </Badge>
                }
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Legal name</TH>
                    <TH>Type</TH>
                    <TH>Currency</TH>
                    <TH>Commitments</TH>
                    <TH>Committed (USD)</TH>
                    <TH>Drawn (USD)</TH>
                    <TH>In wallet (USD)</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {investors.map((i) => (
                    <TR key={i.id}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/development-os/investors/${i.investorCode}`}
                          className="hover:underline"
                        >
                          {i.investorCode}
                        </Link>
                      </TD>
                      <TD className="font-medium">{i.legalName}</TD>
                      <TD className="text-xs text-ink-secondary">
                        {INVESTOR_TYPE_LABEL[i.investorType]}
                      </TD>
                      <TD className="text-xs">{i.primaryCurrency}</TD>
                      <TDNum>{i.commitmentCount}</TDNum>
                      <TDNum>
                        {formatUsdMinor(BigInt(i.totalCommittedUsdMinor))}
                      </TDNum>
                      <TDNum>
                        {formatUsdMinor(BigInt(i.totalDrawnUsdMinor))}
                      </TDNum>
                      <TDNum>
                        {formatUsdMinor(
                          BigInt(i.walletAvailableTotalUsdMinor),
                        )}
                      </TDNum>
                      <TD>
                        <Badge
                          tone={
                            i.status === "active"
                              ? "success"
                              : i.status === "exited"
                                ? "neutral"
                                : "warning"
                          }
                        >
                          {INVESTOR_STATUS_LABEL[i.status]}
                        </Badge>
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </Section>
        </>
      )}
    </DevelopmentShell>
  );
}
