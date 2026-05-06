import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { eq } from "drizzle-orm";
import { PageHeader } from "@/components/ui/page-header";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getBankAccounts,
  getCompanyTotalUSDBalance,
} from "@/lib/development/server/bank-accounts";
import { getTransactions } from "@/lib/development/server/transactions";
import { getProjectFinancialSummary } from "@/lib/development/server/budget";
import { evaluateSelfSustainingThreshold } from "@/lib/development/server/self-sustaining";
import { getLatestFXSnapshot } from "@/lib/development/server/fx";
import { projects } from "@/lib/db/schema/projects";
import { developmentProjectMeta } from "@/lib/db/schema/development";
import {
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Finance · Development OS" };
export const dynamic = "force-dynamic";

export default async function FinancePage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Finance" },
          ]}
          title="Finance"
        />
        <EmptyState
          title="Finance dashboard runs against the database"
          description="Set DATABASE_URL and run npm run db:seed:dev-os."
          action={<Badge tone="warning">DATABASE_URL not set</Badge>}
        />
      </DevelopmentShell>
    );
  }

  const projectRows = await db
    .select({
      id: projects.id,
      name: projects.name,
      slug: projects.slug,
      isSelfSustaining: developmentProjectMeta.isSelfSustaining,
      lastSelfSustainingCheckAt:
        developmentProjectMeta.lastSelfSustainingCheckAt,
    })
    .from(projects)
    .leftJoin(
      developmentProjectMeta,
      eq(developmentProjectMeta.projectId, projects.id),
    );

  const [bankAccounts, recentTx, companyTotal, latestFx] = await Promise.all([
    safeQuery("getBankAccounts", getBankAccounts(), [], 4000),
    safeQuery("getTransactions", getTransactions({}, { limit: 10 }), [], 4000),
    safeQuery(
      "getCompanyTotalUSDBalance",
      getCompanyTotalUSDBalance(),
      0n,
      4000,
    ),
    safeQuery("getLatestFXSnapshot", getLatestFXSnapshot(), null, 4000),
  ]);

  const projectSummaries = await Promise.all(
    projectRows.map(async (p) => {
      const summary = await safeQuery(
        `getProjectFinancialSummary:${p.slug}`,
        getProjectFinancialSummary(p.id),
        {
          totalBudgetUsdMinor: "0",
          totalCommittedUsdMinor: "0",
          totalActualUsdMinor: "0",
          remainingBudgetUsdMinor: "0",
          budgetConsumedPercent: 0,
          outstandingCommitmentUsdMinor: "0",
          byCategoryType: {
            capex: { budget: "0", actual: "0" },
            opex: { budget: "0", actual: "0" },
            cogs: { budget: "0", actual: "0" },
          },
        },
        4000,
      );
      const sustainCheck = await safeQuery(
        `evaluateSelfSustainingThreshold:${p.slug}`,
        evaluateSelfSustainingThreshold(p.id),
        {
          projectId: p.id,
          isThresholdMet: false,
          netCashFlowUsdMinor: "0",
          inflowUsdMinor: "0",
          outflowUsdMinor: "0",
          evaluationPeriodDays: 90,
          evaluatedAt: new Date().toISOString(),
        },
        4000,
      );
      return { ...p, summary, sustainCheck };
    }),
  );

  const totalBudget = projectSummaries.reduce(
    (acc, p) => acc + BigInt(p.summary.totalBudgetUsdMinor),
    0n,
  );
  const totalCommitted = projectSummaries.reduce(
    (acc, p) => acc + BigInt(p.summary.totalCommittedUsdMinor),
    0n,
  );
  const totalActual = projectSummaries.reduce(
    (acc, p) => acc + BigInt(p.summary.totalActualUsdMinor),
    0n,
  );
  const overallBudgetPct =
    totalBudget > 0n
      ? Number((totalActual * 10000n) / totalBudget) / 100
      : 0;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance" },
        ]}
        eyebrow={`${bankAccounts.length} active accounts · ${formatUsdMinor(companyTotal)} on hand`}
        title="Finance"
        description="Three-state cost ledger (budget vs committed vs actual) + bank balances + self-sustaining status. Use the tabs below to drill into transactions, invoices, vendors, cost categories, or bank accounts."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />

      <FinanceTabs />

      <Section eyebrow="Snapshot" title="At a glance">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Total budget"
            value={formatUsdMinor(totalBudget)}
            hint={`${projectSummaries.length} projects`}
          />
          <MetricCard
            label="Committed"
            value={formatUsdMinor(totalCommitted)}
            hint="Open POs"
          />
          <MetricCard
            label="Actual spent"
            value={formatUsdMinor(totalActual)}
            hint={`${overallBudgetPct.toFixed(1)}% of budget`}
          />
          <MetricCard
            label="Cash on hand"
            value={formatUsdMinor(companyTotal)}
            hint={`Across ${bankAccounts.length} accounts`}
          />
        </div>
      </Section>

      <Section
        eyebrow="Self-sustaining"
        title="90-day net cash flow per project"
        description="A project is 'self-sustaining' once net cash flow over the rolling 90-day window is positive. Excludes drawdown receipts and corporate-event flows."
      >
        {projectSummaries.length === 0 ? (
          <EmptyState
            title="No projects with development_project_meta yet"
            description="Run npm run db:seed:dev-os to populate."
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {projectSummaries.map((p) => (
              <div
                key={p.id}
                className="rounded-lg border border-line-soft bg-surface p-4 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">{p.name}</span>
                  <Badge
                    tone={
                      p.sustainCheck.isThresholdMet
                        ? "success"
                        : BigInt(p.sustainCheck.netCashFlowUsdMinor) >=
                            -50_000_00n
                          ? "warning"
                          : "danger"
                    }
                  >
                    {p.sustainCheck.isThresholdMet ? "Self-sustaining" : "Below"}
                  </Badge>
                </div>
                <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                  90-day net cash flow
                </div>
                <div className="text-2xl font-medium tabular-nums">
                  {formatUsdMinor(BigInt(p.sustainCheck.netCashFlowUsdMinor))}
                </div>
                <div className="text-xs text-ink-tertiary">
                  Budget {formatUsdMinor(BigInt(p.summary.totalBudgetUsdMinor))}{" "}
                  · Spent{" "}
                  {formatUsdMinor(BigInt(p.summary.totalActualUsdMinor))} (
                  {p.summary.budgetConsumedPercent.toFixed(1)}%)
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section eyebrow="Bank accounts" title="Active accounts">
        {bankAccounts.length === 0 ? (
          <EmptyState
            title="No bank accounts seeded yet"
            description="Run npm run db:seed:dev-os to populate."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Name</TH>
                <TH>Type</TH>
                <TH>Currency</TH>
                <TH>Balance</TH>
                <TH>USD</TH>
                <TH>Threshold</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {bankAccounts.map((a) => (
                <TR key={a.id}>
                  <TD className="font-mono text-xs">{a.accountCode}</TD>
                  <TD className="text-sm">{a.accountName}</TD>
                  <TD className="text-xs text-ink-secondary">{a.accountType}</TD>
                  <TD className="text-xs">{a.currency}</TD>
                  <TDNum>
                    {formatCurrencyMinor(
                      BigInt(a.currentBalanceMinor),
                      a.currency,
                    )}
                  </TDNum>
                  <TDNum>
                    {formatUsdMinor(BigInt(a.currentBalanceUsdMinor))}
                  </TDNum>
                  <TDNum className="text-xs text-ink-tertiary">
                    {a.minimumBalanceThresholdMinor
                      ? formatCurrencyMinor(
                          BigInt(a.minimumBalanceThresholdMinor),
                          a.currency,
                        )
                      : "—"}
                  </TDNum>
                  <TD>
                    <Badge tone={a.belowThreshold ? "danger" : "success"}>
                      {a.belowThreshold ? "Below threshold" : "OK"}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section eyebrow="Activity" title="Recent transactions">
        {recentTx.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Use the recordTransaction action to add the first one, or run the seed."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Date</TH>
                <TH>Direction</TH>
                <TH>Description</TH>
                <TH>Amount</TH>
                <TH>USD</TH>
                <TH>Reconciled</TH>
              </TR>
            </THead>
            <TBody>
              {recentTx.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-[11px]">{t.transactionCode}</TD>
                  <TD className="text-xs">{t.transactionDate}</TD>
                  <TD>
                    <Badge
                      tone={
                        t.direction === "inflow"
                          ? "success"
                          : t.direction === "outflow"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {t.direction}
                    </Badge>
                  </TD>
                  <TD className="text-xs">{t.description}</TD>
                  <TDNum>
                    {formatCurrencyMinor(BigInt(t.amountMinor), t.currency)}
                  </TDNum>
                  <TDNum>{formatUsdMinor(BigInt(t.amountUsdMinor))}</TDNum>
                  <TD>
                    {t.reconciledAt ? (
                      <Badge tone="success">Yes</Badge>
                    ) : (
                      <Badge tone="warning">No</Badge>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {latestFx && (
        <Section
          eyebrow="FX"
          title={`Latest snapshot — ${String(latestFx.snapshotDate)} (${latestFx.source})`}
        >
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
            <FxRow label="USD → IDR" rate={String(latestFx.rateIdr)} />
            {latestFx.rateRub && (
              <FxRow label="USD → RUB" rate={String(latestFx.rateRub)} />
            )}
            {latestFx.rateEur && (
              <FxRow label="USD → EUR" rate={String(latestFx.rateEur)} />
            )}
            <FxRow label="USD → USDT" rate={String(latestFx.rateUsdt)} />
            {latestFx.rateCny && (
              <FxRow label="USD → CNY" rate={String(latestFx.rateCny)} />
            )}
          </div>
        </Section>
      )}
    </DevelopmentShell>
  );
}

function FxRow({ label, rate }: { label: string; rate: string }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface px-3 py-2">
      <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </div>
      <div className="font-mono text-sm">{rate}</div>
    </div>
  );
}
