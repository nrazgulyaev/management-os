import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { desc, eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  devCommitmentsLedger,
  devCostCategories,
  devTransactions,
} from "@/lib/db/schema/dev-finance";
import { projects } from "@/lib/db/schema/projects";
import { contacts } from "@/lib/db/schema/contacts";
import { getBankAccounts } from "@/lib/development/server/bank-accounts";
import {
  COMMITMENT_LEDGER_STATUS_LABEL,
  commitmentLedgerStatusTone,
} from "@/lib/development/constants/commitment-ledger-constants";
import {
  CURRENCY_LABEL,
  formatCurrencyMinor,
  formatUsdMinor,
  type SupportedCurrency,
} from "@/lib/development/constants/investor-constants";
import {
  CancelCommitmentControl,
  CommitmentStatusOverrideControl,
  MarkCommitmentPaidControl,
  type BankAccountChoice,
} from "../_controls";

export const metadata: Metadata = {
  title: "Commitment detail · Development OS",
};
export const dynamic = "force-dynamic";

/** Map the legacy commitment-ledger BadgeTone onto a handoff badge tone,
 *  so the same status palette renders through HandoffBadge. */
const LEDGER_TONE_TO_HANDOFF: Record<
  string,
  "ok" | "warn" | "danger" | "gold" | "info" | "soft"
> = {
  success: "ok",
  warning: "warn",
  danger: "danger",
  gold: "gold",
  info: "info",
  neutral: "soft",
};

export default async function CommitmentLedgerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <div className="crumb">
              <Link href="/development-os">Development OS</Link> /{" "}
              <Link href="/development-os/finance/commitments">
                Commitments (PO)
              </Link>{" "}
              / <span>Detail</span>
            </div>
            <h1>Commitment detail</h1>
          </div>
        </div>
        <EmptyState
          title="Database not configured"
          description="Set DATABASE_URL to view commitment details."
          action={<HandoffBadge tone="warn">DATABASE_URL not set</HandoffBadge>}
        />
      </DevelopmentShell>
    );
  }

  const [commitment] = await db
    .select()
    .from(devCommitmentsLedger)
    .where(eq(devCommitmentsLedger.id, id))
    .limit(1);
  if (!commitment) notFound();

  const [project] = await db
    .select({ name: projects.name })
    .from(projects)
    .where(eq(projects.id, commitment.projectId))
    .limit(1);
  const [category] = await db
    .select({ name: devCostCategories.displayName })
    .from(devCostCategories)
    .where(eq(devCostCategories.id, commitment.categoryId))
    .limit(1);
  const vendor = commitment.vendorContactId
    ? (
        await db
          .select({ name: contacts.fullName })
          .from(contacts)
          .where(eq(contacts.id, commitment.vendorContactId))
          .limit(1)
      )[0]
    : null;

  // Actuals paid against this commitment (outflows linked to it).
  const txns = await db
    .select()
    .from(devTransactions)
    .where(eq(devTransactions.relatedCommitmentId, commitment.id))
    .orderBy(desc(devTransactions.transactionDate));

  const paidUsdMinor = txns
    .filter((t) => t.direction === "outflow")
    .reduce((acc, t) => acc + BigInt(t.amountUsdMinor), 0n);
  const committedUsdMinor = BigInt(commitment.amountUsdMinor);
  const remainingUsdMinor =
    committedUsdMinor - paidUsdMinor > 0n
      ? committedUsdMinor - paidUsdMinor
      : 0n;
  const paidPercent =
    committedUsdMinor > 0n
      ? Number((paidUsdMinor * 1000n) / committedUsdMinor) / 10
      : 0;

  // Remaining in the commitment's ORIGINAL currency (what the operator pays
  // in). Derived from the original committed amount minus USD-paid converted
  // back at the commitment's FX — kept conservative (>= 0).
  const fx = Number(commitment.fxRateAtCommit) || 1;
  const originalMinor = BigInt(commitment.amountOriginalMinor);
  const isUsdt = commitment.amountCurrency === "USDT";
  const minorScale = isUsdt ? 1_000_000 : 100;
  const paidOriginalMinor =
    commitment.amountCurrency === "USD"
      ? paidUsdMinor
      : BigInt(
          Math.round(
            (Number(paidUsdMinor) / 100) * fx * minorScale,
          ),
        );
  const remainingOriginalMinor =
    originalMinor - paidOriginalMinor > 0n
      ? originalMinor - paidOriginalMinor
      : 0n;

  const bankAccounts = await getBankAccounts();
  const bankChoices: BankAccountChoice[] = bankAccounts.map((b) => ({
    id: b.id,
    label: `${b.accountCode} · ${b.accountName}`,
    currency: b.currency,
  }));

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance/commitments">
              Commitments (PO)
            </Link>{" "}
            / <span>{commitment.commitmentCode}</span>
          </div>
          <h1>{commitment.description}</h1>
          {project && (
            <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
              {`${project.name} · ${category?.name ?? "Uncategorised"}`}
            </p>
          )}
        </div>
        <div className="actions">
          <Link
            href="/development-os/finance/commitments"
            className="btn btn-secondary"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            All commitments
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Terms</div>
        <Card padding="default">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <Kpi
              label="Committed"
              value={formatCurrencyMinor(
                originalMinor,
                commitment.amountCurrency as SupportedCurrency,
              )}
              sub={`≈ ${formatUsdMinor(committedUsdMinor)} at FX ${commitment.fxRateAtCommit}`}
            />
            <Kpi
              label="Paid"
              value={formatUsdMinor(paidUsdMinor)}
              sub={`${paidPercent.toFixed(1)}% of committed`}
            />
            <Kpi
              label="Remaining"
              value={formatUsdMinor(remainingUsdMinor)}
              sub="Outstanding balance"
            />
            <Kpi
              label="Transactions"
              value={String(txns.length)}
              sub="Actuals linked to this PO"
            />
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-ink-secondary">
            <HandoffBadge
              tone={
                LEDGER_TONE_TO_HANDOFF[
                  commitmentLedgerStatusTone(commitment.status)
                ]
              }
            >
              {COMMITMENT_LEDGER_STATUS_LABEL[
                commitment.status as keyof typeof COMMITMENT_LEDGER_STATUS_LABEL
              ] ?? commitment.status}
            </HandoffBadge>
            <span>
              Currency:{" "}
              {CURRENCY_LABEL[commitment.amountCurrency as SupportedCurrency] ??
                commitment.amountCurrency}
            </span>
            <span>Committed: {commitment.committedDate}</span>
            {commitment.expectedCompletionDate && (
              <span>Expected: {commitment.expectedCompletionDate}</span>
            )}
            {commitment.contractDocumentId && (
              <HandoffBadge tone="info">Contract on file</HandoffBadge>
            )}
          </div>
          {commitment.notes && (
            <p className="mt-3 text-xs text-ink-secondary whitespace-pre-wrap">
              {commitment.notes}
            </p>
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">Lifecycle</div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="rounded-md border border-line-soft p-4 flex flex-col gap-3">
            <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              Record manual payment
            </div>
            <MarkCommitmentPaidControl
              commitmentId={commitment.id}
              projectId={commitment.projectId}
              categoryId={commitment.categoryId}
              currency={commitment.amountCurrency}
              remainingMinor={remainingOriginalMinor.toString()}
              bankAccounts={bankChoices}
              status={commitment.status}
            />
          </div>
          <div className="rounded-md border border-line-soft p-4 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Manual status override
              </div>
              <CommitmentStatusOverrideControl
                commitmentId={commitment.id}
                currentStatus={commitment.status}
              />
            </div>
            <div className="flex flex-col gap-2">
              <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                Cancel
              </div>
              <CancelCommitmentControl
                commitmentId={commitment.id}
                status={commitment.status}
              />
            </div>
          </div>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Actuals</div>
        {txns.length === 0 ? (
          <EmptyState
            title="No payments yet"
            description="Use the Record manual payment control above to log the first outflow against this PO."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Date</TH>
                <TH>Direction</TH>
                <TH>Amount</TH>
                <TH>USD</TH>
                <TH>Description</TH>
              </TR>
            </THead>
            <TBody>
              {txns.map((t) => (
                <TR key={t.id}>
                  <TD className="font-mono text-xs">
                    <Link
                      href={`/development-os/finance/transactions/${t.id}`}
                      className="hover:underline"
                    >
                      {t.transactionCode}
                    </Link>
                  </TD>
                  <TD className="text-xs">{t.transactionDate}</TD>
                  <TD className="text-xs">{t.direction}</TD>
                  <TDNum>
                    {formatCurrencyMinor(
                      BigInt(t.amountMinor),
                      t.currency as SupportedCurrency,
                    )}
                  </TDNum>
                  <TDNum>{formatUsdMinor(BigInt(t.amountUsdMinor))}</TDNum>
                  <TD className="text-xs text-ink-secondary">
                    {t.description}
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
