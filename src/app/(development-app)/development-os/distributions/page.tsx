import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Plus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { MetricCard } from "@/components/ui/metric-card";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDistributions } from "@/lib/development/server/distributions";
import {
  DISTRIBUTION_STATUS_LABEL,
  DISTRIBUTION_TYPE_LABEL,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Distributions · Development OS",
};
export const dynamic = "force-dynamic";

export default async function DistributionsPage() {
  const db = getDb();
  const distributions = db
    ? await safeQuery(
        "getDistributions",
        getDistributions(),
        [] as Awaited<ReturnType<typeof getDistributions>>,
        4000,
      )
    : [];

  const declared = distributions.filter((d) => d.status === "declared");
  const completed = distributions.filter((d) => d.status === "completed");
  const totalDeclared = declared.reduce(
    (acc, d) => acc + BigInt(d.totalAmountUsdMinor),
    0n,
  );
  const totalExecuted = completed.reduce(
    (acc, d) => acc + BigInt(d.totalAmountUsdMinor),
    0n,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Distributions" },
        ]}
        eyebrow={
          db
            ? `${distributions.length} total · ${declared.length} pending execution`
            : "Database not configured"
        }
        title="Distributions"
        description="Capital returns and profit distributions to investors. Declare a distribution to compute per-commitment allocations; execute to attribute funds to wallets. Cash payout to investors is a separate wallet withdrawal action."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild>
              <Link href="/development-os/distributions/new">
                <Plus className="w-4 h-4" strokeWidth={1.75} />
                Declare distribution
              </Link>
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
          title="Distributions need the database"
          description="Database connection not configured. Contact support."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      )}

      {db && (
        <>
          <Section eyebrow="Snapshot" title="At a glance">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <MetricCard
                label="Pending execution"
                value={String(declared.length)}
                hint={formatUsdMinor(totalDeclared)}
              />
              <MetricCard
                label="Completed"
                value={String(completed.length)}
                hint={formatUsdMinor(totalExecuted)}
              />
              <MetricCard
                label="Total distributions"
                value={String(distributions.length)}
              />
              <MetricCard
                label="Cancelled"
                value={String(
                  distributions.filter((d) => d.status === "cancelled").length,
                )}
              />
            </div>
          </Section>

          <Section eyebrow="All distributions" title="Chronological">
            {distributions.length === 0 ? (
              <EmptyState
                title="No distributions yet"
                description="Click 'Declare distribution' to compute and stage your first allocation."
              
          action={
            <Link href="/development-os/distributions" className="inline-flex items-center justify-center rounded-full border border-line-soft bg-surface px-4 py-2 text-sm font-medium text-ink hover:bg-muted/40">View distributions</Link>
          }
        />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>#</TH>
                    <TH>Project</TH>
                    <TH>Type</TH>
                    <TH>Total (USD)</TH>
                    <TH>Trigger</TH>
                    <TH>Declared</TH>
                    <TH>Effective</TH>
                    <TH>Allocations</TH>
                    <TH>Status</TH>
                  </TR>
                </THead>
                <TBody>
                  {distributions.map((d) => (
                    <TR key={d.id}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/development-os/distributions/${d.id}`}
                          className="hover:underline"
                        >
                          #{d.distributionNumber}
                        </Link>
                      </TD>
                      <TD className="text-sm">
                        {d.projectName ?? (
                          <span className="text-ink-tertiary">Company-wide</span>
                        )}
                      </TD>
                      <TD className="text-xs">
                        {DISTRIBUTION_TYPE_LABEL[d.distributionType]}
                      </TD>
                      <TDNum>
                        {formatUsdMinor(BigInt(d.totalAmountUsdMinor))}
                      </TDNum>
                      <TD className="text-xs text-ink-secondary">
                        {d.triggerReason.replace(/_/g, " ")}
                      </TD>
                      <TD className="text-xs">
                        {new Date(d.declaredAt).toLocaleDateString()}
                      </TD>
                      <TD className="text-xs">{d.effectiveDate}</TD>
                      <TDNum>{d.allocationCount}</TDNum>
                      <TD>
                        <Badge
                          tone={
                            d.status === "completed"
                              ? "success"
                              : d.status === "declared"
                                ? "warning"
                                : d.status === "executing"
                                  ? "info"
                                  : "neutral"
                          }
                        >
                          {DISTRIBUTION_STATUS_LABEL[d.status]}
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
