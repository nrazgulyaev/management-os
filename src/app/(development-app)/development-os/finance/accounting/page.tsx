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
import {
  getAgingReport,
  type AgingReport,
} from "@/lib/development/server/general-ledger/aging";
import { getBankReconciliationView } from "@/lib/development/server/general-ledger/bank-reconciliation";
import { notificationQueue } from "@/lib/db/schema/notifications";
import { and, desc, eq } from "drizzle-orm";
import { ReconciliationMatcher } from "./_reconciliation-matcher";
import { AgingSection, type AgingInvoiceRow } from "./_aging-view";

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

/** Serialize aging rows for the client view (bigint → string minor units). */
function serializeAgingRows(report: AgingReport): AgingInvoiceRow[] {
  return report.rows.map((r) => ({
    id: r.id,
    invoiceNumber: r.invoiceNumber,
    counterparty: r.counterparty,
    currency: r.currency,
    dueDate: r.dueDate,
    outstandingMinor: r.outstandingMinor.toString(),
    daysPastDue: r.daysPastDue,
    bucket: r.bucket,
  }));
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

  // Persisted "Remind" state — latest AR payment-reminder per invoice, so
  // the button reflects reminders filed in earlier sessions. Template key
  // mirrors _aging-actions.ts (literal repeated: "use server" files may
  // only export async functions).
  const reminderRows =
    arAging && arAging.rows.length > 0
      ? await safeQuery(
          "arReminderLog",
          db
            .select({
              payload: notificationQueue.payload,
              createdAt: notificationQueue.createdAt,
            })
            .from(notificationQueue)
            .where(
              and(
                eq(notificationQueue.organizationId, organizationId),
                eq(notificationQueue.templateKey, "finance.ar_payment_reminder"),
              ),
            )
            .orderBy(desc(notificationQueue.createdAt))
            .limit(300),
          [],
          4000,
        )
      : [];
  const remindedAt: Record<string, string> = {};
  for (const r of reminderRows) {
    const invoiceId = (r.payload as Record<string, unknown> | null)?.invoiceId;
    if (typeof invoiceId === "string" && !(invoiceId in remindedAt)) {
      remindedAt[invoiceId] = r.createdAt.toISOString();
    }
  }

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
        description="Outstanding receivables grouped by counterparty, bucketed 0–30 / 31–60 / 61–90 / 90+ from the due date as of the reporting date. Remind files an in-app payment reminder to the finance team via the notification queue (external dunning channels are not connected yet)."
      >
        {!arAging ? (
          <EmptyState title="AR aging unavailable" description="No open receivables, or the query timed out." />
        ) : (
          <AgingSection
            kind="ar"
            rows={serializeAgingRows(arAging)}
            remindedAt={remindedAt}
          />
        )}
      </Section>

      <Section
        eyebrow="Payables"
        title="AP aging — money we owe"
        description="Outstanding payables grouped by vendor, bucketed by age from the due date as of the reporting date. Pay opens the invoice's payment form — payments are recorded there, never here."
      >
        {!apAging ? (
          <EmptyState title="AP aging unavailable" description="No open payables, or the query timed out." />
        ) : (
          <AgingSection kind="ap" rows={serializeAgingRows(apAging)} />
        )}
      </Section>

      <Section
        eyebrow="Reconciliation"
        title={`Bank ↔ GL matching · ${recon.matchedCount} matched · ${recon.unmatchedCount} open`}
        description="Tie imported bank lines to posted journal entries. Manual matching only — each match is audit-logged. Variance shows where the bank line and the journal net diverge."
        action={
          <Link
            href="/development-os/finance/statement-import"
            className="btn btn-secondary btn-sm"
          >
            Import bank statement →
          </Link>
        }
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
