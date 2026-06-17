import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, inArray } from "drizzle-orm";
import { ArrowLeft } from "lucide-react";
import { SectionHeading } from "@/components/dashboard/primitives";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { TransactionTaxClassifyCard } from "@/components/development/finance/transaction-tax-classify-card";
import { getDb } from "@/lib/db/client";
import {
  devTransactions,
  devBankAccounts,
  devCostCategories,
  devCommitmentsLedger,
} from "@/lib/db/schema/dev-finance";
import { projects } from "@/lib/db/schema/projects";
import { listActiveTaxTypes } from "@/lib/development/server/tax/tax-actions";
import { safeQuery } from "@/lib/development/safe-query";
import { requireOrgId } from "@/features/auth/require-org";
import {
  formatCurrencyMinor,
  formatUsdMinor,
} from "@/lib/development/constants/investor-constants";
import {
  TransactionEditControls,
  type ProjectOption,
  type CommitmentOption,
} from "./_controls";

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
        <SectionHeading
          eyebrow="Development OS · transactions"
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

  // Org-scoped option lists for the inline-edit drawer (split / link).
  const organizationId = await requireOrgId();
  const [projectRows, commitmentRows] = await Promise.all([
    safeQuery(
      "txn-edit-projects",
      db
        .select({ id: projects.id, name: projects.name })
        .from(projects)
        .where(eq(projects.organizationId, organizationId))
        .orderBy(asc(projects.name)),
      [],
      4000,
    ),
    safeQuery(
      "txn-edit-commitments",
      db
        .select({
          id: devCommitmentsLedger.id,
          commitmentCode: devCommitmentsLedger.commitmentCode,
          description: devCommitmentsLedger.description,
          amountUsdMinor: devCommitmentsLedger.amountUsdMinor,
          status: devCommitmentsLedger.status,
        })
        .from(devCommitmentsLedger)
        .where(
          and(
            eq(devCommitmentsLedger.organizationId, organizationId),
            inArray(devCommitmentsLedger.status, ["open", "partially_paid"]),
          ),
        )
        .orderBy(asc(devCommitmentsLedger.commitmentCode)),
      [],
      4000,
    ),
  ]);

  const projectOptions: ProjectOption[] = projectRows.map((p) => ({
    id: p.id,
    name: p.name,
  }));
  const commitmentOptions: CommitmentOption[] = commitmentRows.map((c) => ({
    id: c.id,
    label: `${c.commitmentCode} · ${formatUsdMinor(BigInt(c.amountUsdMinor))} · ${c.description}`,
  }));

  const currentAllocation =
    t.allocationType === "multi_project" &&
    t.allocationMetadata != null &&
    typeof t.allocationMetadata === "object"
      ? (t.allocationMetadata as Record<string, number>)
      : null;

  const projNameById = new Map(projectOptions.map((p) => [p.id, p.name]));

  return (
    <DevelopmentShell>
      <SectionHeading
        eyebrow={`${t.transactionCode} · ${t.transactionDate}`}
        title={t.description}
        subtitle={t.notes ?? undefined}
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/transactions">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Ledger
            </Link>
          </Button>
        }
      />

      <section>
        <div className="label">Details</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Transaction record
        </h2>
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
        <TransactionEditControls
          transactionId={t.id}
          reconciled={t.reconciledAt != null}
          currentAllocation={currentAllocation}
          currentCommitmentId={t.relatedCommitmentId ?? null}
          projects={projectOptions}
          commitments={commitmentOptions}
        />
      </section>

      {currentAllocation != null &&
        Object.keys(currentAllocation).length > 0 && (
          <section>
            <div className="label">Allocation</div>
            <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
              Multi-project split
            </h2>
            <table className="data max-w-md">
              <thead>
                <tr>
                  <th>Project</th>
                  <th className="num">Share</th>
                  <th className="num">USD</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(currentAllocation).map(([pid, ratio]) => (
                  <tr key={pid}>
                    <td>{projNameById.get(pid) ?? pid}</td>
                    <td className="num">{(Number(ratio) * 100).toFixed(1)}%</td>
                    <td className="num">
                      {formatUsdMinor(
                        BigInt(
                          Math.round(
                            Number(t.amountUsdMinor) * Number(ratio),
                          ),
                        ),
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-ink-tertiary">
              Edit via “Split allocation” above. Shares sum to 100%.
            </p>
          </section>
        )}

      <section>
        <div className="label">Tax</div>
        <h2 className="display" style={{ fontSize: 22, marginTop: 6, marginBottom: 14, fontWeight: 500 }}>
          Classification + audit
        </h2>
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
      </section>
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
