/**
 * Stage 5.D — AI Procurement Analyst pure helpers.
 */

export interface SupplierMetricsInput {
  supplierId: string;
  supplierName: string;
  totalDeliveries: number;
  lateDeliveries: number;
  /** Average days late on completed deliveries. NaN if none. */
  avgDelayDays: number;
  averageLeadTimeDays: number;
  totalSpendMinor: number;
}

export interface SupplierAssessment extends SupplierMetricsInput {
  onTimePct: number;
  /** Composite reliability score 0-100. */
  reliabilityScore: number;
  classification: "preferred" | "monitor" | "underperforming";
  recommendation: string;
}

export interface ProcurementAnalystOutput {
  ranked: SupplierAssessment[];
  preferred: SupplierAssessment[];
  underperforming: SupplierAssessment[];
  recommendedActions: string[];
  totalSpendAnalysedMinor: number;
}

function classify(score: number): SupplierAssessment["classification"] {
  if (score >= 80) return "preferred";
  if (score >= 50) return "monitor";
  return "underperforming";
}

export function analyzeSuppliers(
  inputs: SupplierMetricsInput[],
): ProcurementAnalystOutput {
  const assessments: SupplierAssessment[] = inputs.map((s) => {
    const onTimePct =
      s.totalDeliveries > 0
        ? ((s.totalDeliveries - s.lateDeliveries) / s.totalDeliveries) * 100
        : 0;
    // Reliability: 70% on-time pct + 30% inverse-of-avg-delay
    const delayPenalty = Number.isFinite(s.avgDelayDays)
      ? Math.max(0, Math.min(100, 100 - s.avgDelayDays * 5))
      : 50;
    const reliabilityScore = Math.round(
      onTimePct * 0.7 + delayPenalty * 0.3,
    );
    const classification = classify(reliabilityScore);
    let recommendation = "";
    if (classification === "preferred") {
      recommendation = `Preferred supplier — continue routing volume here.`;
    } else if (classification === "monitor") {
      recommendation = `Monitor — request improvement plan before next major PO.`;
    } else {
      recommendation = `Underperforming — switch to alternate; do not award new POs.`;
    }
    return {
      ...s,
      onTimePct,
      reliabilityScore,
      classification,
      recommendation,
    };
  });

  const ranked = [...assessments].sort(
    (a, b) => b.reliabilityScore - a.reliabilityScore,
  );
  const preferred = ranked.filter((a) => a.classification === "preferred");
  const underperforming = ranked.filter(
    (a) => a.classification === "underperforming",
  );
  const totalSpendAnalysedMinor = inputs.reduce(
    (acc, s) => acc + s.totalSpendMinor,
    0,
  );
  const recommendedActions = underperforming.map(
    (s) => `Replace ${s.supplierName} on next PO cycle.`,
  );
  if (recommendedActions.length === 0 && preferred.length > 0) {
    recommendedActions.push(
      `Consolidate volume with ${preferred[0].supplierName} (top reliability score).`,
    );
  }
  return {
    ranked,
    preferred,
    underperforming,
    recommendedActions,
    totalSpendAnalysedMinor,
  };
}
