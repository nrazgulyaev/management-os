"use client";

/**
 * Phase 2.2 dev-04 — Quote comparison client wrapper.
 *
 * Owns the award-modal state on the client. Confirming the award calls
 * the org-scoped `awardRfqQuotation` adapter (→ selectQuotation), which
 * creates the purchase_orders row + advances the RFQ to po_created, then
 * routes the operator to the new PO list.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { QuoteCompare, type QuoteCompareColumn } from "@/components/procurement/quote-compare";
import { AgentRecommendBanner } from "@/components/procurement/agent-recommend-banner";
import { AwardPoModal } from "@/components/procurement/award-po-modal";
import { awardRfqQuotation } from "./_actions";

export interface QuoteCompareClientProps {
  rfqId: string;
  alreadyAwarded: boolean;
  columns: QuoteCompareColumn[];
  recommendation: {
    winnerQuotationId: string;
    winnerVendorId: string;
    winnerName: string;
    rationale: string;
    confidence: number;
    winnerTotalUsd: number;
  } | null;
}

export function QuoteCompareClient({
  rfqId,
  alreadyAwarded,
  columns,
  recommendation,
}: QuoteCompareClientProps) {
  const router = useRouter();
  const [awardOpen, setAwardOpen] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const handleConfirm = async (reason: string) => {
    if (!recommendation) return;
    setError(null);
    const result = await awardRfqQuotation({
      quotationId: recommendation.winnerQuotationId,
      reason,
    });
    if (result.ok) {
      setAwardOpen(false);
      router.push("/development-os/cabinets/procurement-manager/pos");
      router.refresh();
    } else {
      setError(result.error);
    }
  };

  return (
    <>
      <QuoteCompare columns={columns} />
      {error && (
        <p className="text-[13px] text-danger mt-2" role="alert">
          {error}
        </p>
      )}
      {recommendation && !alreadyAwarded && (
        <AgentRecommendBanner
          winner={recommendation.winnerName}
          rationale={recommendation.rationale}
          confidence={recommendation.confidence}
          onAward={() => setAwardOpen(true)}
        />
      )}
      {alreadyAwarded && (
        <p className="text-[13px] text-ink-3 mt-3">
          This RFQ has already been awarded — a purchase order was generated.
        </p>
      )}
      {recommendation && !alreadyAwarded && (
        <AwardPoModal
          open={awardOpen}
          onOpenChange={setAwardOpen}
          rfqId={rfqId}
          winnerVendorName={recommendation.winnerName}
          winnerTotalUsd={recommendation.winnerTotalUsd}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
