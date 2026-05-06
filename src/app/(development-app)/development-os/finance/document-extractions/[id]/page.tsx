import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
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
        <PageHeader title="Extraction review" />
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          {
            label: "Document extractions",
            href: "/development-os/finance/document-extractions",
          },
          { label: extraction.id.slice(0, 8) },
        ]}
        eyebrow={`${extraction.documentType} · ${extraction.status}`}
        title="Extraction review"
        description="Review the AI-extracted fields, override anything that's wrong, then approve to create a transaction. Nothing is created until you click Approve."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance/document-extractions">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Back to inbox
            </Link>
          </Button>
        }
      />

      <Section eyebrow="HITL" title="Approve, edit, or reject">
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
      </Section>

      {extraction.ambiguities && extraction.ambiguities.length > 0 && (
        <Section eyebrow="AI flagged" title="Ambiguities">
          <ul className="text-sm text-ink-secondary space-y-1">
            {extraction.ambiguities.map((a, i) => (
              <li key={i} className="flex gap-2">
                <Badge tone="warning">!</Badge>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </DevelopmentShell>
  );
}
