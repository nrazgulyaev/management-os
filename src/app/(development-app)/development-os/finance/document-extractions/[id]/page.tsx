import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { getDocumentExtraction } from "@/lib/development/server/document-extraction-actions";
import { ExtractionReviewPanel } from "@/components/development/finance/extraction-review-panel";
import { getBankAccounts } from "@/lib/development/server/bank-accounts";
import { getCostCategories } from "@/lib/development/server/cost-categories";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = {
  title: "Extraction review · Development OS",
};
export const dynamic = "force-dynamic";

export default async function ExtractionDetailPage({
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
            <h1>Extraction review</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const extraction = await getDocumentExtraction(id);
  if (!extraction) notFound();

  const [bankAccounts, categories] = await Promise.all([
    safeQuery("getBankAccounts", getBankAccounts(), [], 4000),
    safeQuery("getCostCategories", getCostCategories(), [], 4000),
  ]);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <Link href="/development-os/finance/document-extractions">
              Document extractions
            </Link>{" "}
            / <span>{extraction.id.slice(0, 8)}</span>
          </div>
          <h1>Extraction review</h1>
          <div className="label mt-2">{`${extraction.documentType} · ${extraction.status}`}</div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Review the AI-extracted fields, override anything that&apos;s wrong,
            then approve to create a transaction. Nothing is created until you
            click Approve.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os/finance/document-extractions" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Back to inbox
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">HITL</div>
        <ExtractionReviewPanel
          extraction={{
            id: extraction.id,
            documentType: extraction.documentType,
            status: extraction.status as
              | "pending_review"
              | "approved"
              | "edited_approved"
              | "rejected"
              | "duplicate"
              | "superseded",
            detectedLanguage: extraction.detectedLanguage,
            detectedQuality: extraction.detectedQuality,
            extractedData: extraction.extractedData as Record<string, unknown>,
            suggestedVendorId: extraction.suggestedVendorId,
            suggestedProjectId: extraction.suggestedProjectId,
            suggestedCategoryId: extraction.suggestedCategoryId,
            vendorMatchConfidence: extraction.vendorMatchConfidence,
            categoryMatchConfidence: extraction.categoryMatchConfidence,
            reasoning: extraction.reasoning,
            ambiguities: extraction.ambiguities,
            rejectionReason: extraction.rejectionReason,
            createdTransactionId: extraction.createdTransactionId,
            generatedAt: extraction.generatedAt,
            reviewedAt: extraction.reviewedAt,
          }}
          bankAccounts={bankAccounts.map((b) => ({
            id: b.id,
            label: `${b.accountCode} · ${b.accountName}`,
            currency: b.currency,
          }))}
          categories={categories.map((c) => ({
            id: c.id,
            label: c.displayName,
          }))}
        />
      </div>

      {extraction.ambiguities && extraction.ambiguities.length > 0 && (
        <div>
          <div className="label mb-2.5">AI flagged</div>
          <Card padding="default">
            <ul className="text-sm text-ink-secondary space-y-1">
              {extraction.ambiguities.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <HandoffBadge tone="warn">!</HandoffBadge>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </DevelopmentShell>
  );
}
