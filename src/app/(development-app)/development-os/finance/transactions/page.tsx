import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SectionHeading } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getTransactions } from "@/lib/development/server/transactions";
import { getBankAccounts } from "@/lib/development/server/bank-accounts";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { getDevelopmentProjects } from "@/lib/development/server/projects";
import {
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
import { TransactionModalForm } from "@/components/development/finance/transaction-modal-form";
import { TransactionDeleteButton } from "@/components/development/finance/transaction-delete-button";
import { ExportButton } from "@/components/development/bulk-import/export-button";

export const metadata: Metadata = { title: "Transactions · Development OS" };
export const dynamic = "force-dynamic";

interface SearchParams {
  account?: string;
  direction?: "inflow" | "outflow" | "internal_transfer";
  reconciled?: "true" | "false";
}

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
        <SectionHeading
          eyebrow="Development OS · finance · transactions"
          title="Transactions ledger"
        />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const reconciled =
    sp.reconciled === "true"
      ? true
      : sp.reconciled === "false"
        ? false
        : undefined;

  const [accounts, txs, costCategories, projectsList] = await Promise.all([
    safeQuery("getBankAccounts", getBankAccounts(), [], 4000),
    safeQuery(
      "getTransactions",
      getTransactions(
        {
          bankAccountId: sp.account,
          direction: sp.direction,
          reconciled,
        },
        { limit: 200 },
      ),
      [],
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

  const totalInflow = txs
    .filter((t) => t.direction === "inflow")
    .reduce((acc, t) => acc + BigInt(t.amountUsdMinor), 0n);
  const totalOutflow = txs
    .filter((t) => t.direction === "outflow")
    .reduce((acc, t) => acc + BigInt(t.amountUsdMinor), 0n);

  return (
    <DevelopmentShell>
      <SectionHeading
        eyebrow={`${txs.length} transactions · in ${formatUsdMinor(totalInflow)} · out ${formatUsdMinor(totalOutflow)}`}
        title="Transactions ledger"
        subtitle="Actual money movements — the third pillar of the cost ledger."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/finance">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Finance
              </Link>
            </Button>
            {/* HF-7-FINISH A4: surface the bookkeeper entry surfaces
                directly from the list — mirror of the cabinet's
                quick-action strip. */}
            <Button asChild variant="secondary">
              <Link href="/development-os/finance/transactions/quick-entry">
                + Quick entry
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/finance/transactions/import">
                Import CSV/XLSX
              </Link>
            </Button>
            <TransactionModalForm
              bankAccounts={accountOptions}
              costCategories={categoryOptions}
              projects={projectOptions}
            />
            <ExportButton entity="transactions" />
          </div>
        }
      />

      <FinanceTabs />

      <form
        method="GET"
        action="/development-os/finance/transactions"
        className="rounded-lg border border-line-soft bg-surface p-3 grid grid-cols-1 md:grid-cols-4 gap-3 text-sm"
      >
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">Account</span>
          <select
            name="account"
            defaultValue={sp.account ?? ""}
            className="rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
          >
            <option value="">All accounts</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.accountCode}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">Direction</span>
          <select
            name="direction"
            defaultValue={sp.direction ?? ""}
            className="rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
          >
            <option value="">All</option>
            <option value="inflow">Inflow</option>
            <option value="outflow">Outflow</option>
            <option value="internal_transfer">Internal transfer</option>
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">Reconciled</span>
          <select
            name="reconciled"
            defaultValue={sp.reconciled ?? ""}
            className="rounded-md border border-line-soft bg-surface px-2 py-1 text-xs"
          >
            <option value="">All</option>
            <option value="true">Reconciled</option>
            <option value="false">Pending</option>
          </select>
        </label>
        <div className="flex items-end gap-2">
          <Button type="submit">Apply</Button>
          {(sp.account || sp.direction || sp.reconciled) && (
            <Button asChild variant="secondary">
              <Link href="/development-os/finance/transactions">Clear</Link>
            </Button>
          )}
        </div>
      </form>

      <section>
        <div className="label">Ledger</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Filtered transactions
        </h2>
        {txs.length === 0 ? (
          <EmptyState
            title="No transactions match"
            description="Try clearing filters or adjusting the date range."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Date</TH>
                <TH>Account</TH>
                <TH>Direction</TH>
                <TH>Description</TH>
                <TH>Amount</TH>
                <TH>USD</TH>
                <TH>Reconciled</TH>
                <TH>Tax</TH>
                <TH></TH>
              </TR>
            </THead>
            <TBody>
              {txs.map((t) => {
                const acc = accounts.find((a) => a.id === t.bankAccountId);
                return (
                  <TR key={t.id}>
                    <TD className="font-mono text-[11px]">
                      <Link
                        href={`/development-os/finance/transactions/${t.id}`}
                        className="hover:underline"
                      >
                        {t.transactionCode}
                      </Link>
                    </TD>
                    <TD className="text-xs">{t.transactionDate}</TD>
                    <TD className="text-xs">{acc?.accountCode ?? "—"}</TD>
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
                    <TD>
                      {(() => {
                        const status =
                          (t as { taxClassificationStatus?: string })
                            .taxClassificationStatus ?? "unclassified";
                        const tone =
                          status === "classified"
                            ? "success"
                            : status === "reviewed"
                              ? "info"
                              : status === "tax_exempt"
                                ? "neutral"
                                : status === "flagged_missing_doc"
                                  ? "warning"
                                  : "danger";
                        const label =
                          status === "classified"
                            ? "🟢"
                            : status === "reviewed"
                              ? "🟡"
                              : status === "tax_exempt"
                                ? "⚪"
                                : status === "flagged_missing_doc"
                                  ? "🟠"
                                  : "🔴";
                        return <Badge tone={tone}>{label}</Badge>;
                      })()}
                    </TD>
                    <TD>
                      <TransactionDeleteButton
                        transactionId={t.id}
                        transactionCode={t.transactionCode}
                      />
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </section>
    </DevelopmentShell>
  );
}
