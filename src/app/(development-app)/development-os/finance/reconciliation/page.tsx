import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Play } from "lucide-react";
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
  getReconciliationStats,
  listBankTransactionsForUi,
} from "@/lib/banking/queries";
import { runReconciliationAction } from "@/lib/banking/bookkeeper-actions";

export const metadata: Metadata = { title: "Reconciliation · Finance" };
export const dynamic = "force-dynamic";

export default async function ReconciliationPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Reconciliation" />
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL."
        />
      </DevelopmentShell>
    );
  }
  const [stats, partial] = await Promise.all([
    getReconciliationStats(),
    listBankTransactionsForUi({
      matchStatus: "partial_match",
      limit: 100,
    }),
  ]);
  const total = stats.matched + stats.partial + stats.unmatched;
  const matchRate = total === 0 ? 0 : Math.round((stats.matched / total) * 100);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Reconciliation" },
        ]}
        eyebrow={`${matchRate}% auto-matched · ${stats.partial} need review · ${stats.unmatched} unmatched`}
        title="Reconciliation dashboard"
        description="Auto-matcher confidence ≥ 0.95 → auto-match. 0.5–0.95 → flagged for manual review here. The 30-min reconciliation cron retries unmatched transactions when new invoices land."
        actions={
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
        }
      />

      <Section
        title="Partial matches — needs review"
        description="The auto-matcher found a candidate but isn't confident. Confirm or reject manually."
      >
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
                    <Badge tone="warning">{t.matchStatus}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums text-xs">
                    {t.matchConfidence ?? "—"}
                  </TD>
                </TR>
              ))}
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
