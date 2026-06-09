import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
import { getDb } from "@/lib/db/client";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import {
  getBalanceSheet,
  getIncomeStatement,
  type StatementGroup,
} from "@/lib/development/server/general-ledger/financial-statements";
import { getAgingReport } from "@/lib/development/server/general-ledger/aging";
import { getBankReconciliationView } from "@/lib/development/server/general-ledger/bank-reconciliation";
import { ReconciliationMatcher } from "./_reconciliation-matcher";

export const metadata: Metadata = { title: "Accounting · Development OS" };
export const dynamic = "force-dynamic";

/** Render bigint minor units as a plain accounting number (2dp, signed). */
function fmt(minor: bigint): string {
  const neg = minor < 0n;
  const abs = neg ? -minor : minor;
  const n = Number(abs) / 100;
  return `${neg ? "−" : ""}${n.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function startOfYear(iso: string): string {
  return `${iso.slice(0, 4)}-01-01`;
}

function StatementSection({
  group,
  totalLabel,
}: {
  group: StatementGroup;
  totalLabel: string;
}) {
  if (group.lines.length === 0) {
    return (
      <p className="text-sm text-ink-tertiary py-2">No {group.label.toLowerCase()} activity.</p>
    );
  }
  return (
    <Table>
      <THead>
        <TR>
          <TH>Code</TH>
          <TH>{group.label}</TH>
          <TH className="text-right">Amount</TH>
        </TR>
      </THead>
      <TBody>
        {group.lines.map((l) => (
          <TR key={l.code}>
            <TD className="font-mono text-xs">{l.code}</TD>
            <TD className="text-sm">{l.name}</TD>
            <TDNum>{fmt(l.amountMinor)}</TDNum>
          </TR>
        ))}
        <TR>
          <TD />
          <TD className="text-sm font-medium">{totalLabel}</TD>
          <TDNum className="font-medium">{fmt(group.subtotalMinor)}</TDNum>
        </TR>
      </TBody>
    </Table>
  );
}

interface AgingReportLike {
  totals: {
    currentMinor: bigint;
    d31_60Minor: bigint;
    d61_90Minor: bigint;
    d90PlusMinor: bigint;
    totalMinor: bigint;
  };
  rows: Array<{
    id: string;
    invoiceNumber: string;
    counterparty: string;
    currency: string;
    dueDate: string;
    outstandingMinor: bigint;
    daysPastDue: number;
    bucket: string;
  }>;
}

function AgingTable({ report, title }: { report: AgingReportLike; title: string }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        <MetricCard label="Current (0-30)" value={fmt(report.totals.currentMinor)} />
        <MetricCard label="31-60" value={fmt(report.totals.d31_60Minor)} />
        <MetricCard label="61-90" value={fmt(report.totals.d61_90Minor)} />
        <MetricCard label="90+" value={fmt(report.totals.d90PlusMinor)} />
        <MetricCard label="Total outstanding" value={fmt(report.totals.totalMinor)} />
      </div>
      {report.rows.length === 0 ? (
        <p className="text-sm text-ink-tertiary">No open {title.toLowerCase()}.</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Invoice</TH>
              <TH>Counterparty</TH>
              <TH>Due</TH>
              <TH className="text-right">Days past due</TH>
              <TH>Bucket</TH>
              <TH className="text-right">Outstanding</TH>
            </TR>
          </THead>
          <TBody>
            {report.rows.map((r) => (
              <TR key={r.id}>
                <TD className="font-mono text-xs">{r.invoiceNumber}</TD>
                <TD className="text-sm">{r.counterparty}</TD>
                <TD className="text-xs">{r.dueDate}</TD>
                <TDNum>{r.daysPastDue}</TDNum>
                <TD>
                  <Badge
                    tone={
                      r.bucket === "current"
                        ? "neutral"
                        : r.bucket === "31-60"
                          ? "info"
                          : r.bucket === "61-90"
                            ? "warning"
                            : "danger"
                    }
                  >
                    {r.bucket}
                  </Badge>
                </TD>
                <TDNum>
                  {fmt(r.outstandingMinor)} {r.currency}
                </TDNum>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}

export default async function AccountingDeskPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Accounting" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const sp = (await searchParams) ?? {};
  const today = new Date().toISOString().slice(0, 10);
  const asOf = typeof sp.asOf === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.asOf) ? sp.asOf : today;
  const from =
    typeof sp.from === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.from)
      ? sp.from
      : startOfYear(asOf);
  const to =
    typeof sp.to === "string" && /^\d{4}-\d{2}-\d{2}$/.test(sp.to) ? sp.to : asOf;

  const organizationId = await requireOrgId();

  const [bs, pl, apAging, arAging, recon] = await Promise.all([
    safeQuery(
      "balanceSheet",
      getBalanceSheet(organizationId, asOf),
      null,
      5000,
    ),
    safeQuery(
      "incomeStatement",
      getIncomeStatement(organizationId, from, to),
      null,
      5000,
    ),
    safeQuery(
      "apAging",
      getAgingReport(organizationId, "payable", asOf),
      null,
      5000,
    ),
    safeQuery(
      "arAging",
      getAgingReport(organizationId, "receivable", asOf),
      null,
      5000,
    ),
    safeQuery(
      "bankReconciliation",
      getBankReconciliationView(organizationId, { limit: 100 }),
      { unmatched: [], matched: [], candidates: [], matchedCount: 0, unmatchedCount: 0 },
      5000,
    ),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Accounting" },
        ]}
        eyebrow={`As of ${asOf} · period ${from} → ${to}`}
        title="Accounting desk"
        description="Balance sheet, income statement, AP/AR aging, and bank reconciliation — all derived from the double-entry general ledger. Money is held in minor units; statements tie to the trial balance."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/general-ledger">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              General ledger
            </Link>
          </Button>
        }
      />

      <FinanceTabs />

      <Section
        eyebrow="Period controls"
        title="Reporting window"
        description="Balance sheet + aging are AS OF the date; the income statement covers the period. Defaults: year-to-date through today."
      >
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            As of (balance sheet / aging)
            <input
              type="date"
              name="asOf"
              defaultValue={asOf}
              className="rounded border border-line-soft bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Period from (P&L)
            <input
              type="date"
              name="from"
              defaultValue={from}
              className="rounded border border-line-soft bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Period to (P&L)
            <input
              type="date"
              name="to"
              defaultValue={to}
              className="rounded border border-line-soft bg-surface px-2 py-1.5 text-sm"
            />
          </label>
          <Button type="submit" variant="primary" size="sm">
            Apply
          </Button>
        </form>
      </Section>

      <Section
        eyebrow="Statement of financial position"
        title={`Balance sheet — as of ${asOf}`}
        description="Asset, liability, and equity balances rolled from the GL. Current-period net income (not yet closed to retained earnings) is shown separately; the identity below proves the books tie."
      >
        {!bs ? (
          <EmptyState title="Balance sheet unavailable" description="No posted journal entries yet, or the query timed out." />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              <MetricCard label="Total assets" value={fmt(bs.totalAssetsMinor)} />
              <MetricCard label="Total liabilities" value={fmt(bs.totalLiabilitiesMinor)} />
              <MetricCard label="Total equity" value={fmt(bs.totalEquityMinor)} />
              <MetricCard
                label="Net income (to date)"
                value={fmt(bs.retainedFromIncomeMinor)}
                hint="Unclosed revenue − expense"
              />
            </div>
            <div className="flex items-center gap-3">
              <Badge tone={bs.balanced ? "success" : "danger"}>
                {bs.balanced ? "Identity balances ✓" : "OUT OF BALANCE"}
              </Badge>
              <span className="text-xs text-ink-secondary font-mono">
                Assets = Liabilities + Equity + Net income
                {!bs.balanced && <> · Δ {fmt(bs.imbalanceMinor)}</>}
              </span>
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="flex flex-col gap-4">
                <StatementSection group={bs.assets} totalLabel="Total assets" />
              </div>
              <div className="flex flex-col gap-4">
                <StatementSection group={bs.liabilities} totalLabel="Total liabilities" />
                <StatementSection group={bs.equity} totalLabel="Total equity" />
              </div>
            </div>
          </div>
        )}
      </Section>

      <Section
        eyebrow="Statement of operations"
        title={`Income statement — ${from} → ${to}`}
        description="Revenue and expense activity for the selected period. Net income flows to retained earnings at period close."
      >
        {!pl ? (
          <EmptyState title="Income statement unavailable" description="No posted journal entries in this period, or the query timed out." />
        ) : (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-3 gap-2">
              <MetricCard label="Revenue" value={fmt(pl.totalRevenueMinor)} />
              <MetricCard label="Expenses" value={fmt(pl.totalExpenseMinor)} />
              <MetricCard
                label="Net income"
                value={fmt(pl.netIncomeMinor)}
                hint={pl.netIncomeMinor >= 0n ? "Profit" : "Loss"}
              />
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StatementSection group={pl.revenue} totalLabel="Total revenue" />
              <StatementSection group={pl.expense} totalLabel="Total expenses" />
            </div>
          </div>
        )}
      </Section>

      <Section
        eyebrow="Receivables"
        title="AR aging — money owed to us"
        description="Outstanding receivable invoices bucketed by age from the due date, as of the reporting date."
      >
        {!arAging ? (
          <EmptyState title="AR aging unavailable" description="No open receivables, or the query timed out." />
        ) : (
          <AgingTable report={arAging} title="receivables" />
        )}
      </Section>

      <Section
        eyebrow="Payables"
        title="AP aging — money we owe"
        description="Outstanding payable invoices bucketed by age from the due date, as of the reporting date."
      >
        {!apAging ? (
          <EmptyState title="AP aging unavailable" description="No open payables, or the query timed out." />
        ) : (
          <AgingTable report={apAging} title="payables" />
        )}
      </Section>

      <Section
        eyebrow="Reconciliation"
        title={`Bank ↔ GL matching · ${recon.matchedCount} matched · ${recon.unmatchedCount} open`}
        description="Tie imported bank lines to posted journal entries. Manual matching only — each match is audit-logged. Variance shows where the bank line and the journal net diverge."
      >
        <ReconciliationMatcher
          unmatched={recon.unmatched.map((u) => ({
            ...u,
            amountMinor: u.amountMinor.toString(),
          }))}
          matched={recon.matched.map((m) => ({
            ...m,
            amountMinor: m.amountMinor.toString(),
            varianceMinor: m.varianceMinor.toString(),
          }))}
          candidates={recon.candidates.map((c) => ({
            ...c,
            netMinor: c.netMinor.toString(),
          }))}
        />
      </Section>
    </DevelopmentShell>
  );
}
