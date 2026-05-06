import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { TransactionTaxClassifyCard } from "@/components/development/finance/transaction-tax-classify-card";
import { getDb } from "@/lib/db/client";
import { devTransactions, devBankAccounts, devCostCategories } from "@/lib/db/schema/dev-finance";
import { projects } from "@/lib/db/schema/projects";
import { listActiveTaxTypes } from "@/lib/development/server/tax/tax-actions";
import { safeQuery } from "@/lib/development/safe-query";
import {
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";

export const metadata: Metadata = { title: "Transaction · Development OS" };
export const dynamic = "force-dynamic";

export default async function TransactionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader
          breadcrumbs={[
            { label: "Development OS", href: "/development-os" },
            { label: "Transactions", href: "/development-os/finance/transactions" },
            { label: "Detail" },
          ]}
          title="Transaction"
        />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const [t] = await db
    .select()
    .from(devTransactions)
    .where(eq(devTransactions.id, id))
    .limit(1);
  if (!t) notFound();

  const [acc] = await db
    .select({ id: devBankAccounts.id, code: devBankAccounts.accountCode, name: devBankAccounts.accountName })
    .from(devBankAccounts)
    .where(eq(devBankAccounts.id, t.bankAccountId))
    .limit(1);
  const cat = t.categoryId
    ? (
        await db
          .select({ code: devCostCategories.categoryCode, name: devCostCategories.displayName })
          .from(devCostCategories)
          .where(eq(devCostCategories.id, t.categoryId))
          .limit(1)
      )[0]
    : null;
  const proj = t.projectId
    ? (
        await db
          .select({ name: projects.name, slug: projects.slug })
          .from(projects)
          .where(eq(projects.id, t.projectId))
          .limit(1)
      )[0]
    : null;

  const taxTypeRows = await safeQuery(
    "listActiveTaxTypes",
    listActiveTaxTypes(),
    [],
    4000,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Transactions", href: "/development-os/finance/transactions" },
          { label: t.transactionCode },
        ]}
        eyebrow={`${t.transactionCode} · ${t.transactionDate}`}
        title={t.description}
        description={t.notes ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/transactions">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Ledger
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Details" title="Transaction record">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <Field label="Direction" value={t.direction} />
          <Field
            label="Amount"
            value={formatCurrencyMinor(
              BigInt(t.amountMinor),
              t.currency as Parameters<typeof formatCurrencyMinor>[1],
            )}
          />
          <Field label="USD equivalent" value={formatUsdMinor(BigInt(t.amountUsdMinor))} />
          <Field label="FX rate" value={String(t.fxRateAtTransaction)} />
          <Field label="Account" value={acc ? `${acc.code} · ${acc.name}` : "—"} />
          <Field label="Category" value={cat ? `${cat.code} · ${cat.name}` : "—"} />
          <Field label="Project" value={proj ? proj.name : "—"} />
          <Field label="Counterparty" value={t.counterpartyName ?? "—"} />
          <Field label="External ref" value={t.externalReference ?? "—"} mono />
          <Field label="Allocation type" value={t.allocationType} />
          <Field
            label="Reconciled"
            value={
              t.reconciledAt
                ? `${new Date(t.reconciledAt).toLocaleDateString()} (${t.bankStatementLineRef ?? "—"})`
                : "Pending"
            }
          />
          <Field
            label="Linked drawdown"
            value={t.relatedDrawdownId ? "Yes" : "—"}
            mono
          />
        </div>
        <div className="mt-3 text-xs text-ink-tertiary">
          Inline edit (allocation split, reconciliation, document attach) is
          available via the <code>splitTransactionAllocation</code>,{" "}
          <code>reconcileTransaction</code>, and{" "}
          <code>linkTransactionToCommitmentLedger</code> server actions; UI
          drawer for these is forthcoming.
        </div>
      </Section>

      {t.allocationMetadata != null && (
        <Section eyebrow="Allocation" title="Multi-project split">
          <pre className="rounded-md border border-line-soft bg-surface p-4 text-xs overflow-auto">
            {JSON.stringify(t.allocationMetadata, null, 2)}
          </pre>
        </Section>
      )}

      <Section eyebrow="Tax" title="Classification + audit">
        <TransactionTaxClassifyCard
          transaction={{
            transactionId: t.id,
            amountMinor: String(t.amountMinor),
            currency: t.currency,
            taxTypeId:
              (t as { taxTypeId?: string | null }).taxTypeId ?? null,
            taxAmountMinor:
              (t as { taxAmountMinor?: string | bigint | null })
                .taxAmountMinor != null
                ? String(
                    (t as { taxAmountMinor?: string | bigint | null })
                      .taxAmountMinor,
                  )
                : null,
            isTaxIncluded:
              (t as { isTaxIncluded?: boolean | null }).isTaxIncluded ?? null,
            taxClassificationStatus:
              (t as { taxClassificationStatus?: string })
                .taxClassificationStatus ?? "unclassified",
            taxDocumentId:
              (t as { taxDocumentId?: string | null }).taxDocumentId ?? null,
          }}
          taxTypes={taxTypeRows.map((tt) => ({
            id: tt.id,
            typeKey: tt.typeKey,
            displayName: tt.displayName,
            ratePercentage: String(tt.ratePercentage),
            isIncludedInAmount: tt.isIncludedInAmount,
          }))}
        />
      </Section>
    </DevelopmentShell>
  );
}

function Field({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
        {label}
      </span>
      <span className={mono ? "font-mono text-xs" : ""}>{value}</span>
    </div>
  );
}
