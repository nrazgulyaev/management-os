import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Accounting</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Accounting</span>
          </div>
          <h1>Accounting desk</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Balance sheet, income statement, AP/AR aging, and bank
            reconciliation — all derived from the double-entry general ledger.
            Money is held in minor units; statements tie to the trial balance.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/finance/general-ledger"
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            General ledger
          </Link>
        </div>
      </div>

      <FinanceTabs />

      <div>
        <div className="label mb-2.5">Period controls</div>
        <Card padding="default">
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
            <button type="submit" className="btn btn-accent btn-sm">
              Apply
            </button>
          </form>
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Statement of financial position</div>
        <Card padding="default">
          {!bs ? (
            <EmptyState title="Balance sheet unavailable" description="No posted journal entries yet, or the query timed out." />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Kpi label="Total assets" value={fmt(bs.totalAssetsMinor)} />
                <Kpi label="Total liabilities" value={fmt(bs.totalLiabilitiesMinor)} />
                <Kpi label="Total equity" value={fmt(bs.totalEquityMinor)} />
                <Kpi
                  label="Net income (to date)"
                  value={fmt(bs.retainedFromIncomeMinor)}
                  sub="Unclosed revenue − expense"
                />
              </div>
              <div className="flex items-center gap-3">
                <HandoffBadge tone={bs.balanced ? "ok" : "danger"}>
                  {bs.balanced ? "Identity balances ✓" : "OUT OF BALANCE"}
                </HandoffBadge>
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
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Statement of operations</div>
        <Card padding="default">
          {!pl ? (
            <EmptyState title="Income statement unavailable" description="No posted journal entries in this period, or the query timed out." />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-3 gap-2">
                <Kpi label="Revenue" value={fmt(pl.totalRevenueMinor)} />
                <Kpi label="Expenses" value={fmt(pl.totalExpenseMinor)} />
                <Kpi
                  label="Net income"
                  value={fmt(pl.netIncomeMinor)}
                  sub={pl.netIncomeMinor >= 0n ? "Profit" : "Loss"}
                />
              </div>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <StatementSection group={pl.revenue} totalLabel="Total revenue" />
                <StatementSection group={pl.expense} totalLabel="Total expenses" />
              </div>
            </div>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Receivables</div>
        {!arAging ? (
          <Card padding="default">
            <EmptyState title="AR aging unavailable" description="No open receivables, or the query timed out." />
          </Card>
        ) : (
          <AgingSection
            kind="ar"
            rows={serializeAgingRows(arAging)}
            remindedAt={remindedAt}
          />
        )}
      </div>

      <div>
        <div className="label mb-2.5">Payables</div>
        {!apAging ? (
          <Card padding="default">
            <EmptyState title="AP aging unavailable" description="No open payables, or the query timed out." />
          </Card>
        ) : (
          <AgingSection kind="ap" rows={serializeAgingRows(apAging)} />
        )}
      </div>

      <div>
        <div className="flex items-end justify-between mb-2.5">
          <div className="label">Reconciliation</div>
          <Link
            href="/development-os/finance/statement-import"
            className="btn btn-secondary btn-sm"
          >
            Import bank statement →
          </Link>
        </div>
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
      </div>
    </DevelopmentShell>
  );
}
