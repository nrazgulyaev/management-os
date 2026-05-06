/**
 * Stage 5.D — AI Tax Assistant pure helpers.
 */

export interface TransactionForTaxInput {
  transactionId: string;
  amountMinor: number;
  vendorName: string;
  description: string;
  category: string | null;
  hasTaxClassification: boolean;
  hasUploadedDocument: boolean;
  ageDays: number;
}

export interface ClassificationSuggestion {
  transactionId: string;
  suggestedTaxType: string;
  rationale: string;
  confidence: "low" | "medium" | "high";
}

export interface DocumentGap {
  transactionId: string;
  vendorName: string;
  amountMinor: number;
  reason: string;
}

export interface TaxAssistantOutput {
  classificationSuggestions: ClassificationSuggestion[];
  documentGaps: DocumentGap[];
  unclassifiedCount: number;
  unclassifiedTotalMinor: number;
  periodCloseReadinessScore: number;
  recommendedActions: string[];
}

const VENDOR_PATTERNS: Array<{ regex: RegExp; taxType: string }> = [
  { regex: /catering|warung|food/i, taxType: "PPh23_jasa_catering" },
  { regex: /transport|trucking|logistik/i, taxType: "PPh23_jasa_transportasi" },
  { regex: /konsultan|consult|advisory/i, taxType: "PPh23_jasa_konsultan" },
  { regex: /sewa|rent/i, taxType: "PPh4_2_sewa" },
  { regex: /material|beton|semen|baja/i, taxType: "PPN_input" },
  { regex: /gaji|payroll|salary/i, taxType: "PPh21_gaji" },
];

export function suggestClassifications(
  transactions: TransactionForTaxInput[],
): ClassificationSuggestion[] {
  return transactions
    .filter((t) => !t.hasTaxClassification)
    .map((t) => {
      const haystack = `${t.vendorName} ${t.description}`;
      const match = VENDOR_PATTERNS.find((p) => p.regex.test(haystack));
      if (match) {
        return {
          transactionId: t.transactionId,
          suggestedTaxType: match.taxType,
          rationale: `Vendor name / description matches pattern "${match.regex.source}".`,
          confidence: "high" as const,
        };
      }
      return {
        transactionId: t.transactionId,
        suggestedTaxType: "REVIEW_MANUALLY",
        rationale: "No pattern matched — operator review required.",
        confidence: "low" as const,
      };
    });
}

export function detectDocumentGaps(
  transactions: TransactionForTaxInput[],
): DocumentGap[] {
  return transactions
    .filter((t) => t.hasTaxClassification && !t.hasUploadedDocument)
    .map((t) => ({
      transactionId: t.transactionId,
      vendorName: t.vendorName,
      amountMinor: t.amountMinor,
      reason:
        "Transaction has tax classification but no supporting document uploaded.",
    }));
}

export function periodCloseReadiness(
  transactions: TransactionForTaxInput[],
): number {
  if (transactions.length === 0) return 100;
  const classified = transactions.filter((t) => t.hasTaxClassification).length;
  const documented = transactions.filter(
    (t) => t.hasTaxClassification && t.hasUploadedDocument,
  ).length;
  // Score = 60% classification rate + 40% documentation rate.
  const classRate = (classified / transactions.length) * 100;
  const docRate =
    classified > 0 ? (documented / classified) * 100 : 0;
  return Math.round(classRate * 0.6 + docRate * 0.4);
}

export function buildTaxAssistantOutput(
  transactions: TransactionForTaxInput[],
): TaxAssistantOutput {
  const classificationSuggestions = suggestClassifications(transactions);
  const documentGaps = detectDocumentGaps(transactions);
  const unclassified = transactions.filter((t) => !t.hasTaxClassification);
  const score = periodCloseReadiness(transactions);
  const recommendedActions: string[] = [];
  if (unclassified.length > 0) {
    recommendedActions.push(
      `Classify ${unclassified.length} transaction(s) (${classificationSuggestions.filter((s) => s.confidence === "high").length} have high-confidence suggestions).`,
    );
  }
  if (documentGaps.length > 0) {
    recommendedActions.push(
      `Upload supporting documents for ${documentGaps.length} transaction(s).`,
    );
  }
  if (score < 80) {
    recommendedActions.push(
      `Period close readiness ${score}% — resolve outstanding items before close date.`,
    );
  }
  if (recommendedActions.length === 0) {
    recommendedActions.push("Period is close-ready.");
  }
  return {
    classificationSuggestions,
    documentGaps,
    unclassifiedCount: unclassified.length,
    unclassifiedTotalMinor: unclassified.reduce(
      (a, t) => a + t.amountMinor,
      0,
    ),
    periodCloseReadinessScore: score,
    recommendedActions,
  };
}
