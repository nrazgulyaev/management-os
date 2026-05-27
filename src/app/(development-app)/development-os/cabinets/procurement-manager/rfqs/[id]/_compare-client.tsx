"use client";

/**
 * Phase 2.2 dev-04 — Quote comparison client wrapper.
 *
 * Owns the award-modal state on the client so the server page can
 * stay async + RSC-only.
 */

import * as React from "react";
import { QuoteCompare, type QuoteCompareColumn } from "@/components/procurement/quote-compare";
import { AgentRecommendBanner } from "@/components/procurement/agent-recommend-banner";
import { AwardPoModal } from "@/components/procurement/award-po-modal";

export interface QuoteCompareClientProps {
  rfqId: string;
  columns: QuoteCompareColumn[];
  recommendation: {
    winnerVendorId: string;
    winnerName: string;
    rationale: string;
    confidence: number;
    winnerTotalUsd: number;
  } | null;
}

export function QuoteCompareClient({
  rfqId,
  columns,
  recommendation,
}: QuoteCompareClientProps) {
  const [awardOpen, setAwardOpen] = React.useState(false);

  return (
    <>
      <QuoteCompare columns={columns} />
      {recommendation && (
        <AgentRecommendBanner
          winner={recommendation.winnerName}
          rationale={recommendation.rationale}
          confidence={recommendation.confidence}
          onAward={() => setAwardOpen(true)}
        />
      )}
      {recommendation && (
        <AwardPoModal
          open={awardOpen}
          onOpenChange={setAwardOpen}
          rfqId={rfqId}
          winnerVendorName={recommendation.winnerName}
          winnerTotalUsd={recommendation.winnerTotalUsd}
        />
      )}
    </>
  );
}
