import type { Metadata } from "next";
import Link from "next/link";
import { Search } from "lucide-react";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getTransactions,
  getTransactionLedgerSummary,
  type TransactionLedgerSummary,
} from "@/lib/development/server/transactions";
import { getBankAccounts } from "@/lib/development/server/bank-accounts";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import {
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { requireOrgId } from "@/features/auth/require-org";
import { safeQuery } from "@/lib/development/safe-query";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
import { TransactionModalForm } from "@/components/development/finance/transaction-modal-form";
import { TransactionDeleteButton } from "@/components/development/finance/transaction-delete-button";
import { ExportButton } from "@/components/development/bulk-import/export-button";

export const metadata: Metadata = { title: "Transactions · Development OS" };
export const dynamic = "force-dynamic";

const LIST_LIMIT = 200;

interface SearchParams {
  account?: string;
  direction?: string;
  reconciled?: "true" | "false";
  category?: string;
  project?: string;
  q?: string;
}

const EMPTY_SUMMARY: TransactionLedgerSummary = {
  incomeUsdMinor: "0",
  expenseUsdMinor: "0",
  profitUsdMinor: "0",
  inflowCount: 0,
  outflowCount: 0,
  txCount: 0,
  expenseByCategory: [],
};

/** Build a query string, dropping empty params. */
function qs(params: Record<string, string | undefined>): string {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) u.set(k, v);
  }
  const s = u.toString();
  return s ? `?${s}` : "";
}

/** `formatUsdMinor` with a typographic minus for negative values. */
function formatSignedUsd(minor: bigint): string {
  return minor < 0n ? `−${formatUsdMinor(-minor)}` : formatUsdMinor(minor);
}

/** Compact USD for the breakdown-bar value column ($1.2M / $45.3K / $980). */
function compactUsd(minor: bigint): string {
  const neg = minor < 0n;
  const dollars = Number(neg ? -minor : minor) / 100;
  const s =
    dollars >= 1_000_000
      ? `$${(dollars / 1_000_000).toFixed(1)}M`
      : dollars >= 1_000
        ? `$${(dollars / 1_000).toFixed(1)}K`
        : `$${dollars.toFixed(0)}`;
  return neg ? `−${s}` : s;
}

const TAX_STATUS_BADGE: Record<
  string,
  { label: string; tone: "ok" | "warn" | "danger" | "info" | "soft" }
> = {
  classified: { label: "classified", tone: "ok" },
  reviewed: { label: "reviewed", tone: "info" },
  tax_exempt: { label: "exempt", tone: "soft" },
  flagged_missing_doc: { label: "no doc", tone: "warn" },
  unclassified: { label: "unclassified", tone: "danger" },
};

const DIRECTION_CHIPS: { value?: "inflow" | "outflow" | "internal_transfer"; label: string }[] = [
  { value: undefined, label: "All" },
  { value: "inflow", label: "Income" },
  { value: "outflow", label: "Expense" },
  { value: "internal_transfer", label: "Transfers" },
];

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/finance">Finance</Link> / Transactions
            </div>
            <h1>Transactions &amp; profit.</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const direction: "inflow" | "outflow" | "internal_transfer" | undefined =
    sp.direction === "inflow" ||
    sp.direction === "outflow" ||
    sp.direction === "internal_transfer"
      ? sp.direction
      : undefined;
  const reconciled =
    sp.reconciled === "true"
      ? true
      : sp.reconciled === "false"
        ? false
        : undefined;
  const search = sp.q?.trim() || undefined;

  const organizationId = await requireOrgId().catch(() => undefined);

  const filters = {
    bankAccountId: sp.account || undefined,
    direction,
    reconciled,
    categoryId: sp.category || undefined,
    projectId: sp.project || undefined,
    search,
    organizationId,
  };

  const [accounts, txs, summary, costCategories, projectsList] =
    await Promise.all([
      safeQuery("getBankAccounts", getBankAccounts(), [], 4000),
      safeQuery(
        "getTransactions",
        getTransactions(filters, { limit: LIST_LIMIT }),
        [],
        4000,
      ),
      safeQuery(
        "getTransactionLedgerSummary",
        getTransactionLedgerSummary(filters),
        EMPTY_SUMMARY,
        4000,
      ),
      safeQuery("getCostCategories", getCostCategories(), [], 4000),
      safeQuery("getDevelopmentProjects", getDevelopmentProjects(), [], 4000),
    ]);

  const accountOptions = accounts.map((a) => ({
    id: a.id,
    accountCode: a.accountCode,
    accountName: a.accountName,
    currency: a.currency,
  }));
  const categoryOptions = costCategories.map((c) => ({
    id: c.id,
    categoryCode: c.categoryCode,
    displayName: c.displayName,
  }));
  const projectOptions = projectsList.map((p) => ({ id: p.id, name: p.name }));

  const categoryName = new Map(categoryOptions.map((c) => [c.id, c.displayName]));
  const projectName = new Map(projectOptions.map((p) => [p.id, p.name]));

  const income = BigInt(summary.incomeUsdMinor);
  const expense = BigInt(summary.expenseUsdMinor);
  const profit = BigInt(summary.profitUsdMinor);

  const currentParams = {
    account: sp.account,
    reconciled: sp.reconciled,
    category: sp.category,
    project: sp.project,
    q: sp.q,
  };
  const hasAnyFilter = Boolean(
    direction || sp.account || sp.reconciled || sp.category || sp.project || search,
  );

  const maxCategoryExpense = summary.expenseByCategory.reduce(
    (acc, c) => (BigInt(c.amountUsdMinor) > acc ? BigInt(c.amountUsdMinor) : acc),
    0n,
  );
  const maxFlow = income > expense ? income : expense;
  const expensePct =
    maxFlow > 0n ? Number((expense * 100n) / maxFlow) : 0;
  const profitPct =
    income > 0n
      ? Number(((profit > 0n ? profit : 0n) * 100n) / income)
      : 0;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> / Transactions
          </div>
          <h1>
            Transactions &amp; profit.{" "}
            <span className="text-[var(--amber)]">One signed ledger.</span>
          </h1>
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3)] max-w-[680px]">
            Actual money movements with income, expense and profit computed
            for the filtered window. Slice by direction, category or project,
            or search counterparty, description and references.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/finance/transactions/quick-entry"
            className="btn btn-secondary btn-sm"
          >
            + Quick entry
          </Link>
          <Link
            href="/development-os/finance/transactions/import"
            className="btn btn-secondary btn-sm"
          >
            Import CSV/XLSX
          </Link>
          <ExportButton entity="transactions" />
          <TransactionModalForm
            bankAccounts={accountOptions}
            costCategories={categoryOptions}
            projects={projectOptions}
          />
        </div>
      </div>

      <FinanceTabs />

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-[18px]">
        <Kpi
          label="Income"
          value={formatUsdMinor(income)}
          sub={`${summary.inflowCount} inflows · USD`}
          tone="success"
        />
        <Kpi
          label="Expense"
          value={formatUsdMinor(expense)}
          sub={`${summary.outflowCount} outflows · USD`}
        />
        <Kpi
          label="Profit"
          value={formatSignedUsd(profit)}
          sub="income − expense"
          tone={profit >= 0n ? "success" : "danger"}
        />
        <Kpi
          label="Transactions"
          value={summary.txCount}
          sub={hasAnyFilter ? "in filtered window" : "in ledger"}
        />
      </div>

      <div className="cfo-grid">
        <div>
          <form
            method="GET"
            action="/development-os/finance/transactions"
            className="flex items-center gap-2 flex-wrap mb-3"
          >
            <div className="flex items-center gap-1.5">
              {DIRECTION_CHIPS.map((c) => (
                <Link
                  key={c.label}
                  href={`/development-os/finance/transactions${qs({
                    ...currentParams,
                    direction: c.value,
                  })}`}
                  className={`filter-chip${direction === c.value ? " on" : ""}`}
                >
                  {c.label}
                </Link>
              ))}
            </div>
            {direction && <input type="hidden" name="direction" value={direction} />}
            <div className="w-44">
              <select name="category" defaultValue={sp.category ?? ""} className="select">
                <option value="">All categories</option>
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-44">
              <select name="project" defaultValue={sp.project ?? ""} className="select">
                <option value="">All projects</option>
                {projectOptions.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-36">
              <select name="account" defaultValue={sp.account ?? ""} className="select">
                <option value="">All accounts</option>
                {accountOptions.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.accountCode}
                  </option>
                ))}
              </select>
            </div>
            <div className="w-36">
              <select name="reconciled" defaultValue={sp.reconciled ?? ""} className="select">
                <option value="">Reconciled: all</option>
                <option value="true">Reconciled</option>
                <option value="false">Pending</option>
              </select>
            </div>
            <div className="filter-search">
              <span className="sx">
                <Search className="w-4 h-4" strokeWidth={1.75} />
              </span>
              <input
                name="q"
                defaultValue={sp.q ?? ""}
                placeholder="Search counterparty / description / ref…"
              />
            </div>
            <button type="submit" className="btn btn-primary btn-sm">
              Apply
            </button>
            {hasAnyFilter && (
              <Link
                href="/development-os/finance/transactions"
                className="btn btn-ghost btn-sm"
              >
                Clear
              </Link>
            )}
          </form>

          {txs.length === 0 ? (
            <EmptyState
              title="No transactions match"
              description="Try clearing filters, changing the search, or record a new transaction."
            />
          ) : (
            <Card overflowHidden>
              <div className="overflow-x-auto">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Date</th>
                      <th>Type</th>
                      <th>Category</th>
                      <th>Counterparty / description</th>
                      <th>Project</th>
                      <th className="num">Amount</th>
                      <th className="num">USD</th>
                      <th>Reconciled</th>
                      <th>Tax</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {txs.map((t) => {
                      const sign =
                        t.direction === "inflow"
                          ? "+"
                          : t.direction === "outflow"
                            ? "−"
                            : "";
                      const amtCls =
                        t.direction === "inflow"
                          ? "cfo-amt-in"
                          : "cfo-amt-out";
                      const noteParts = [
                        t.counterpartyName ? t.description : null,
                        t.externalReference,
                      ].filter(Boolean);
                      const taxBadge =
                        TAX_STATUS_BADGE[t.taxClassificationStatus] ??
                        TAX_STATUS_BADGE.unclassified;
                      return (
                        <tr key={t.id}>
                          <td className="mono text-[11px]">
                            <Link
                              href={`/development-os/finance/transactions/${t.id}`}
                              className="hover:underline"
                            >
                              {t.transactionCode}
                            </Link>
                          </td>
                          <td className="mono text-[12px] text-[var(--ink-3)] whitespace-nowrap">
                            {t.transactionDate}
                          </td>
                          <td>
                            <span
                              className={`cfo-typchip ${t.direction === "inflow" ? "in" : "out"}`}
                            >
                              {t.direction === "inflow"
                                ? "income"
                                : t.direction === "outflow"
                                  ? "expense"
                                  : "transfer"}
                            </span>
                          </td>
                          <td className="text-[12.5px]">
                            {t.categoryId
                              ? (categoryName.get(t.categoryId) ?? "—")
                              : "—"}
                          </td>
                          <td>
                            <div className="font-semibold text-[var(--ink)]">
                              {t.counterpartyName ?? t.description}
                            </div>
                            {noteParts.length > 0 && (
                              <div className="text-[11.5px] text-[var(--ink-4)]">
                                {noteParts.join(" · ")}
                              </div>
                            )}
                          </td>
                          <td className="text-[12px] text-[var(--ink-3)]">
                            {t.projectId
                              ? (projectName.get(t.projectId) ?? "—")
                              : "—"}
                          </td>
                          <td className={`num ${amtCls}`}>
                            {sign}
                            {formatCurrencyMinor(BigInt(t.amountMinor), t.currency)}
                          </td>
                          <td className={`num ${amtCls}`}>
                            {sign}
                            {formatUsdMinor(BigInt(t.amountUsdMinor))}
                          </td>
                          <td>
                            {t.reconciledAt ? (
                              <HandoffBadge tone="ok">Yes</HandoffBadge>
                            ) : (
                              <HandoffBadge tone="warn">No</HandoffBadge>
                            )}
                          </td>
                          <td>
                            <HandoffBadge tone={taxBadge.tone}>
                              {taxBadge.label}
                            </HandoffBadge>
                          </td>
                          <td>
                            <TransactionDeleteButton
                              transactionId={t.id}
                              transactionCode={t.transactionCode}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
          <p className="cfo-card-sub mt-2.5">
            Showing {txs.length} of {summary.txCount} matching transactions
            {summary.txCount > txs.length
              ? ` (first ${LIST_LIMIT} by date)`
              : ""}
            .
          </p>
        </div>

        <Card padding="default">
          <div className="cfo-card-head">
            <h3 className="cfo-card-title">Expense breakdown</h3>
            <span className="label">USD · filtered window</span>
          </div>
          {summary.expenseByCategory.length === 0 ? (
            <p className="cfo-card-sub">No expenses in this window.</p>
          ) : (
            summary.expenseByCategory.map((c) => {
              const v = BigInt(c.amountUsdMinor);
              const pct =
                maxCategoryExpense > 0n
                  ? Number((v * 100n) / maxCategoryExpense)
                  : 0;
              return (
                <div className="cfo-bar" key={c.categoryId ?? "uncategorised"}>
                  <span className="cfo-bar-label">
                    {c.displayName ?? c.categoryCode ?? "Uncategorised"}
                  </span>
                  <div className="track">
                    <div className="fill" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="val">{compactUsd(v)}</span>
                </div>
              );
            })
          )}
          <div className="cfo-bar-summary">
            <div className="cfo-bar">
              <span className="cfo-bar-label">Income</span>
              <div className="track">
                <div
                  className="fill ok"
                  style={{ width: income > 0n ? "100%" : "0%" }}
                />
              </div>
              <span className="val">{compactUsd(income)}</span>
            </div>
            <div className="cfo-bar">
              <span className="cfo-bar-label">Expense</span>
              <div className="track">
                <div className="fill ink" style={{ width: `${expensePct}%` }} />
              </div>
              <span className="val">{compactUsd(expense)}</span>
            </div>
            <div className="cfo-bar is-total">
              <span className="cfo-bar-label">Profit</span>
              <div className="track">
                <div
                  className={`fill ${profit >= 0n ? "ok" : "danger"}`}
                  style={{ width: `${profitPct}%` }}
                />
              </div>
              <span
                className="val"
                style={{
                  color: profit >= 0n ? "var(--ok)" : "var(--danger)",
                }}
              >
                {compactUsd(profit)}
              </span>
            </div>
          </div>
        </Card>
      </div>
    </DevelopmentShell>
  );
}
