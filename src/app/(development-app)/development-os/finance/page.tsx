import type { Metadata } from "next";
import Link from "next/link";
import { eq } from "drizzle-orm";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
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
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> / Finance
            </div>
            <h1>Finance.</h1>
          </div>
        </div>
        <EmptyState
          title="Finance dashboard runs against the database"
          description="Database connection not configured. Contact support."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
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
    totalBudget > 0n ? Number((totalActual * 10000n) / totalBudget) / 100 : 0;
  const remaining = totalBudget - totalActual;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> / Finance
          </div>
          <h1>
            Three-state cost ledger.{" "}
            <span className="text-[var(--amber)]">One source of truth.</span>
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Budget vs committed vs actual + bank balances + self-sustaining
            status. {bankAccounts.length} active accounts ·{" "}
            {formatUsdMinor(companyTotal)} on hand. Use the tabs to drill into
            transactions, invoices, vendors, cost categories, or bank accounts.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/cfo"
            className="btn btn-secondary btn-sm"
          >
            CFO console →
          </Link>
          <Link
            href="/development-os/finance/transactions/quick-entry"
            className="btn btn-amber btn-sm"
          >
            + Journal entry
          </Link>
        </div>
      </div>

      <FinanceTabs />

      <div className="cfo-kpis">
        <Kpi
          label="Total budget"
          value={formatUsdMinor(totalBudget)}
          sub={`${projectSummaries.length} projects`}
        />
        <Kpi
          label="Committed"
          value={formatUsdMinor(totalCommitted)}
          sub="open POs"
          tone="accent"
        />
        <Kpi
          label="Actual spent"
          value={formatUsdMinor(totalActual)}
          sub={`${overallBudgetPct.toFixed(1)}% of budget`}
        />
        <Kpi
          label="Remaining"
          value={formatUsdMinor(remaining)}
          sub="budget left"
        />
        <Kpi
          label="Cash on hand"
          value={formatUsdMinor(companyTotal)}
          sub={`across ${bankAccounts.length} accounts`}
          tone="success"
        />
      </div>

      <Card padding="default" className="mb-[18px]">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">90-day net cash flow per project</h3>
          <span className="label">USD · self-sustaining</span>
        </div>
        <p className="cfo-card-sub mb-[14px] max-w-[680px]">
          A project is &quot;self-sustaining&quot; once net cash flow over the
          rolling 90-day window is positive. Excludes drawdown receipts and
          corporate-event flows.
        </p>
        {projectSummaries.length === 0 ? (
          <EmptyState
            title="No development projects yet"
            description="Add your first development project to start tracking budget vs. actuals."
          />
        ) : (
          <div className="fin-cards">
            {projectSummaries.map((p) => {
              const net = BigInt(p.sustainCheck.netCashFlowUsdMinor);
              const tone = p.sustainCheck.isThresholdMet
                ? "ok"
                : net >= -50_000_00n
                  ? "warn"
                  : "danger";
              return (
                <div key={p.id} className="fin-card">
                  <div className="fin-card-head">
                    <span className="fin-card-name">{p.name}</span>
                    <HandoffBadge tone={tone}>
                      {p.sustainCheck.isThresholdMet
                        ? "Self-sustaining"
                        : "Below"}
                    </HandoffBadge>
                  </div>
                  <div className="label">90-day net cash flow</div>
                  <div className="fin-card-v mono">{formatUsdMinor(net)}</div>
                  <div className="cfo-card-sub">
                    Budget{" "}
                    {formatUsdMinor(BigInt(p.summary.totalBudgetUsdMinor))} ·
                    Spent {formatUsdMinor(BigInt(p.summary.totalActualUsdMinor))}{" "}
                    ({p.summary.budgetConsumedPercent.toFixed(1)}%)
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <div className="cfo-grid">
        <Card padding="default">
          <div className="cfo-card-head">
            <h3 className="cfo-card-title">Bank accounts</h3>
            <span className="label">
              {bankAccounts.length} · USD-normalised
            </span>
          </div>
          {bankAccounts.length === 0 ? (
            <EmptyState
              title="No bank accounts yet"
              description="Add your first bank account to start reconciling statements."
            />
          ) : (
            <table className="data">
              <thead>
                <tr>
                  <th>Code</th>
                  <th>Name</th>
                  <th>Cur</th>
                  <th className="num">Balance</th>
                  <th className="num">USD</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {bankAccounts.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{a.accountCode}</td>
                    <td>{a.accountName}</td>
                    <td className="mono text-[var(--ink-3)]">{a.currency}</td>
                    <td className="num">
                      {formatCurrencyMinor(
                        BigInt(a.currentBalanceMinor),
                        a.currency,
                      )}
                    </td>
                    <td className="num">
                      {formatUsdMinor(BigInt(a.currentBalanceUsdMinor))}
                    </td>
                    <td>
                      <HandoffBadge tone={a.belowThreshold ? "danger" : "ok"}>
                        {a.belowThreshold ? "Below" : "OK"}
                      </HandoffBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card padding="default">
          <div className="cfo-card-head">
            <h3 className="cfo-card-title">FX snapshot</h3>
            {latestFx && (
              <span className="label">
                {String(latestFx.snapshotDate)} · {latestFx.source}
              </span>
            )}
          </div>
          {latestFx ? (
            <div className="fin-fx">
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
          ) : (
            <p className="cfo-card-sub mt-[14px]">No FX snapshot yet.</p>
          )}
        </Card>
      </div>

      <Card padding="default">
        <div className="cfo-card-head">
          <h3 className="cfo-card-title">Recent transactions</h3>
          <span className="label">latest 10</span>
        </div>
        {recentTx.length === 0 ? (
          <EmptyState
            title="No transactions yet"
            description="Use the recordTransaction action to add the first one, or run the seed."
            action={
              <Link
                href="/dashboard/jobs"
                className="btn btn-secondary btn-sm"
              >
                View jobs
              </Link>
            }
          />
        ) : (
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Date</th>
                <th>Direction</th>
                <th>Description</th>
                <th className="num">Amount</th>
                <th className="num">USD</th>
                <th>Reconciled</th>
              </tr>
            </thead>
            <tbody>
              {recentTx.map((t) => (
                <tr key={t.id}>
                  <td className="mono">{t.transactionCode}</td>
                  <td className="text-[var(--ink-3)]">{t.transactionDate}</td>
                  <td>
                    <HandoffBadge
                      tone={
                        t.direction === "inflow"
                          ? "ok"
                          : t.direction === "outflow"
                            ? "danger"
                            : "info"
                      }
                    >
                      {t.direction}
                    </HandoffBadge>
                  </td>
                  <td>{t.description}</td>
                  <td className="num">
                    {formatCurrencyMinor(BigInt(t.amountMinor), t.currency)}
                  </td>
                  <td className="num">
                    {formatUsdMinor(BigInt(t.amountUsdMinor))}
                  </td>
                  <td>
                    {t.reconciledAt ? (
                      <HandoffBadge tone="ok">Yes</HandoffBadge>
                    ) : (
                      <HandoffBadge tone="warn">No</HandoffBadge>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </DevelopmentShell>
  );
}

function FxRow({ label, rate }: { label: string; rate: string }) {
  return (
    <div className="fin-fx-row">
      <div className="label">{label}</div>
      <div className="mono text-[14px] text-[var(--ink)]">{rate}</div>
    </div>
  );
}
