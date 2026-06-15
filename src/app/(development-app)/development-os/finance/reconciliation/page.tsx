import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
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
  getReconciliationStats,
  listBankTransactionsForUi,
  listOpenInvoicesForMatch,
} from "@/lib/banking/queries";
import {
  runReconciliationAction,
  matchInvoiceAction,
} from "@/lib/banking/bookkeeper-actions";

export const metadata: Metadata = { title: "Reconciliation · Finance" };
export const dynamic = "force-dynamic";

export default async function ReconciliationPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Reconciliation</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const [stats, partial, openInvoices] = await Promise.all([
    getReconciliationStats(),
    listBankTransactionsForUi({
      matchStatus: "partial_match",
      limit: 100,
    }),
    listOpenInvoicesForMatch(),
  ]);
  const total = stats.matched + stats.partial + stats.unmatched;
  const matchRate = total === 0 ? 0 : Math.round((stats.matched / total) * 100);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Reconciliation</span>
          </div>
          <h1>Reconciliation dashboard</h1>
          <div className="label mt-1.5">
            {matchRate}% auto-matched · {stats.partial} need review ·{" "}
            {stats.unmatched} unmatched
          </div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Auto-matcher confidence ≥ 0.95 → auto-match. 0.5–0.95 → flagged for
            manual review here. The 30-min reconciliation cron retries unmatched
            transactions when new invoices land.
          </p>
        </div>
        <div className="actions">
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/finance/bank-review">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Bank review
              </Link>
            </Button>
            <form action={runReconciliationAction}>
              <Button type="submit" variant="primary" size="sm">
                <Play className="w-4 h-4" strokeWidth={1.75} />
                Run reconciliation now
              </Button>
            </form>
          </div>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Partial matches — needs review</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          The auto-matcher found a candidate but isn&apos;t confident. Confirm or
          reject manually.
        </p>
        {partial.length === 0 ? (
          <EmptyState
            title="No partial matches"
            description="Either everything is reconciled or there's nothing to reconcile yet."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Date</TH>
                <TH>Description</TH>
                <TH>Counterparty</TH>
                <TH className="text-right">Amount</TH>
                <TH>Match status</TH>
                <TH className="text-right">Conf.</TH>
                <TH>Match invoice</TH>
              </TR>
            </THead>
            <TBody>
              {partial.map((t) => (
                <TR key={t.id}>
                  <TD className="text-xs">{t.transactionDate}</TD>
                  <TD>{t.description}</TD>
                  <TD className="text-xs">{t.counterpartyName ?? "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {formatAmount(t.amountMinor, t.currency)}
                  </TD>
                  <TD>
                    <HandoffBadge tone="warn">{t.matchStatus}</HandoffBadge>
                  </TD>
                  <TD className="text-right tabular-nums text-xs">
                    {t.matchConfidence ?? "—"}
                  </TD>
                  <TD>
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
                      <button type="submit" className="btn btn-accent btn-sm">
                        Match
                      </button>
                    </form>
                  </TD>
                </TR>
              ))}
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
