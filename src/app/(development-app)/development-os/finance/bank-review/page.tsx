import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Table,
  THead,
  TBody,
  TR,
  TH,
  TD,
} from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  listBankConnectionsForUi,
  listBankTransactionsForUi,
  getReconciliationStats,
} from "@/lib/banking/queries";
import {
  syncConnectionAction,
  ignoreTransactionAction,
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
        <PageHeader title="Bank review" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const [connections, transactions, stats] = await Promise.all([
    listBankConnectionsForUi(),
    listBankTransactionsForUi({
      matchStatus: statusFilter,
      limit: 200,
    }),
    getReconciliationStats(),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Bank review" },
        ]}
        eyebrow={`${transactions.length} transactions · ${stats.unmatched} unmatched · ${stats.partial} partial · ${stats.matched} matched`}
        title="Bank review"
        description="Daily bookkeeper view: every imported bank transaction with its match + category status. Approve auto-matches, flag misreads, or ignore noise."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/finance">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Finance
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/finance/reconciliation">
                Reconciliation
              </Link>
            </Button>
          </div>
        }
      />

      <Section title="Active connections">
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
                      <Badge
                        tone={
                          c.status === "active"
                            ? "success"
                            : c.status === "error"
                              ? "danger"
                              : "neutral"
                        }
                      >
                        {c.status}
                      </Badge>
                      {c.lastSyncError && (
                        <div className="mt-1 text-[11px] text-danger">
                          {c.lastSyncError.slice(0, 80)}
                        </div>
                      )}
                    </TD>
                    <TD className="text-right">
                      <form action={sync}>
                        <Button type="submit" size="sm" variant="secondary">
                          <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.75} />
                          Sync
                        </Button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>

      <Section
        title="Recent transactions"
        description="Filter by match status. The auto-matcher fires on import + on a 30-min cron sweep."
      >
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
          <Button type="submit" size="sm" variant="primary">
            Apply
          </Button>
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
                        <Badge tone="warning" className="ml-2">
                          pending
                        </Badge>
                      )}
                    </TD>
                    <TD className="text-xs">{t.counterpartyName ?? "—"}</TD>
                    <TD className="text-right tabular-nums">
                      {formatAmount(t.amountMinor, t.currency)}
                    </TD>
                    <TD>
                      <Badge
                        tone={
                          t.matchStatus === "auto_matched" ||
                          t.matchStatus === "manually_matched"
                            ? "success"
                            : t.matchStatus === "partial_match"
                              ? "warning"
                              : t.matchStatus === "unmatched"
                                ? "neutral"
                                : "outline"
                        }
                      >
                        {t.matchStatus}
                      </Badge>
                    </TD>
                    <TD className="text-right tabular-nums text-xs">
                      {t.matchConfidence ?? "—"}
                    </TD>
                    <TD className="text-right">
                      <form action={ignoreBound}>
                        <input
                          type="hidden"
                          name="bankTransactionId"
                          value={t.id}
                        />
                        <Button type="submit" size="sm" variant="secondary">
                          Ignore
                        </Button>
                      </form>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        )}
      </Section>
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
