import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  listBankConnectionsForUi,
  listBankTransactionsForUi,
  getReconciliationStats,
  listOpenInvoicesForMatch,
} from "@/lib/banking/queries";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import {
  syncConnectionAction,
  ignoreTransactionAction,
  matchInvoiceAction,
  assignCategoryAction,
} from "@/lib/banking/bookkeeper-actions";

export const metadata: Metadata = { title: "Bank review · Finance" };
export const dynamic = "force-dynamic";

export default async function BankReviewPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const sp = await searchParams;
  const statusFilter = sp.status as
    | "unmatched"
    | "auto_matched"
    | "manually_matched"
    | "partial_match"
    | "ignored"
    | undefined;

  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Bank review</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const [connections, transactions, stats, openInvoices, categories] =
    await Promise.all([
      listBankConnectionsForUi(),
      listBankTransactionsForUi({
        matchStatus: statusFilter,
        limit: 200,
      }),
      getReconciliationStats(),
      listOpenInvoicesForMatch(),
      getCostCategories(),
    ]);
  const activeCategories = categories.filter((c) => c.isActive);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Bank review</span>
          </div>
          <h1>Bank review</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Daily bookkeeper view: every imported bank transaction with its
            match + category status. Approve auto-matches, flag misreads, or
            ignore noise.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/finance" className="btn btn-secondary">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Finance
          </Link>
          <Link
            href="/development-os/finance/reconciliation"
            className="btn btn-secondary"
          >
            Reconciliation
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Active connections</div>
        {connections.length === 0 ? (
          <EmptyState
            title="No bank connections yet"
            description="Add a connection from /development-os/finance/bank-accounts to start syncing."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Provider</TH>
                <TH>Account</TH>
                <TH>Currency</TH>
                <TH>Last sync</TH>
                <TH>Status</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {connections.map((c) => {
                const sync = syncConnectionAction.bind(null, c.id);
                return (
                  <TR key={c.id}>
                    <TD className="font-mono text-xs">{c.provider}</TD>
                    <TD>{c.accountName ?? c.externalAccountId}</TD>
                    <TD>{c.currency}</TD>
                    <TD className="text-xs text-ink-secondary">
                      {c.lastSyncedAt
                        ? new Date(c.lastSyncedAt)
                            .toISOString()
                            .slice(0, 16)
                            .replace("T", " ")
                        : "—"}
                    </TD>
                    <TD>
                      <HandoffBadge
                        tone={
                          c.status === "active"
                            ? "ok"
                            : c.status === "error"
                              ? "danger"
                              : "soft"
                        }
                      >
                        {c.status}
                      </HandoffBadge>
                      {c.lastSyncError && (
                        <div className="mt-1 text-[11px] text-danger">
                          {c.lastSyncError.slice(0, 80)}
                        </div>
                      )}
                    </TD>
                    <TD className="text-right">
                      <form action={sync}>
                        <button type="submit" className="btn btn-secondary btn-sm">
                          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
                          Sync
                        </button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Recent transactions</div>
        <form
          method="GET"
          action="/development-os/finance/bank-review"
          className="mb-3 flex items-center gap-2 text-sm"
        >
          <label className="flex items-center gap-2">
            <span className="text-ink-secondary text-xs uppercase tracking-wide">
              Status
            </span>
            <select
              name="status"
              defaultValue={sp.status ?? ""}
              className="rounded-md border border-line-soft bg-surface px-3 py-2"
            >
              <option value="">All</option>
              <option value="unmatched">Unmatched</option>
              <option value="partial_match">Partial match</option>
              <option value="auto_matched">Auto-matched</option>
              <option value="manually_matched">Manually matched</option>
              <option value="ignored">Ignored</option>
            </select>
          </label>
          <button type="submit" className="btn btn-accent btn-sm">
            Apply
          </button>
        </form>

        {transactions.length === 0 ? (
          <EmptyState
            title="No transactions match the filter"
            description="Sync a connection or upload a statement to get started."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH>Counterparty</TH>
                <TH className="text-right">Amount</TH>
                <TH>Status</TH>
                <TH className="text-right">Conf.</TH>
                <TH>Category</TH>
                <TH>Match invoice</TH>
                <TH className="text-right">Actions</TH>
              </TR>
            </THead>
            <TBody>
              {transactions.map((t) => {
                const ignoreBound = ignoreTransactionAction.bind(null);
                const fd = new FormData();
                fd.set("bankTransactionId", t.id);
                return (
                  <TR key={t.id}>
                    <TD className="text-xs">{t.transactionDate}</TD>
                    <TD>
                      {t.description}
                      {t.isPending && (
                        <span className="ml-2">
                          <HandoffBadge tone="warn">pending</HandoffBadge>
                        </span>
                      )}
                    </TD>
                    <TD className="text-xs">{t.counterpartyName ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {formatAmount(t.amountMinor, t.currency)}
                    </TD>
                    <TD>
                      <HandoffBadge
                        tone={
                          t.matchStatus === "auto_matched" ||
                          t.matchStatus === "manually_matched"
                            ? "ok"
                            : t.matchStatus === "partial_match"
                              ? "warn"
                              : t.matchStatus === "unmatched"
                                ? "soft"
                                : "soft"
                        }
                      >
                        {t.matchStatus}
                      </HandoffBadge>
                    </TD>
                    <TD className="text-right tabular-nums text-xs">
                      {t.matchConfidence ?? "—"}
                    </TD>
                    <TD>
                      <form
                        action={assignCategoryAction}
                        className="flex items-center gap-1.5"
                      >
                        <input
                          type="hidden"
                          name="bankTransactionId"
                          value={t.id}
                        />
                        <select
                          name="categoryId"
                          defaultValue={t.categoryId ?? ""}
                          className="rounded-md border border-line-soft bg-surface px-2 py-1.5 text-xs max-w-[180px]"
                        >
                          <option value="">Uncategorized</option>
                          {activeCategories.map((c) => (
                            <option key={c.id} value={c.id}>
                              {c.categoryCode} · {c.displayName}
                            </option>
                          ))}
                        </select>
                        <button
                          type="submit"
                          className="btn btn-secondary btn-sm"
                        >
                          Save
                        </button>
                      </form>
                    </TD>
                    <TD>
                      {t.matchStatus === "unmatched" ||
                      t.matchStatus === "partial_match" ? (
                        <form
                          action={matchInvoiceAction}
                          className="flex items-center gap-1.5"
                        >
                          <input
                            type="hidden"
                            name="bankTransactionId"
                            value={t.id}
                          />
                          <select
                            name="invoiceId"
                            defaultValue={t.matchedInvoiceId ?? ""}
                            className="rounded-md border border-line-soft bg-surface px-2 py-1.5 text-xs max-w-[200px]"
                          >
                            <option value="">Reject / unmatched</option>
                            {openInvoices.map((inv) => (
                              <option key={inv.id} value={inv.id}>
                                {inv.invoiceNumber} ·{" "}
                                {formatAmount(inv.amountUsdMinor, inv.currency)}
                              </option>
                            ))}
                          </select>
                          <button
                            type="submit"
                            className="btn btn-accent btn-sm"
                          >
                            Match
                          </button>
                        </form>
                      ) : (
                        <span className="text-xs text-ink-tertiary">—</span>
                      )}
                    </TD>
                    <TD className="text-right">
                      <form action={ignoreBound}>
                        <input
                          type="hidden"
                          name="bankTransactionId"
                          value={t.id}
                        />
                        <button type="submit" className="btn btn-secondary btn-sm">
                          Ignore
                        </button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}

function formatAmount(amount: bigint | number | string, currency: string): string {
  const minor = typeof amount === "bigint" ? amount : BigInt(amount as string);
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  const major = (abs / 100n).toString();
  const minorPart = (abs % 100n).toString().padStart(2, "0");
  const sign = negative ? "-" : "";
  return `${sign}${major}.${minorPart} ${currency}`;
}
