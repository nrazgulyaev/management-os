/**
 * Pure statement-anomaly rules (no DB, no server-only) — unit-testable.
 * The server detector (statement-anomaly-detector.ts) reads the persisted
 * lines and delegates to detectStatementAnomalies() here.
 *
 * Deterministic by design: financial flags must be reproducible and
 * explainable. Emits the persisted `statement_anomalies` taxonomy.
 */

import type {
  StatementAnomalyKind,
  StatementAnomalySeverity,
} from "@/lib/db/schema/statement-anomalies";

export interface AnomalyLine {
  id: string;
  lineType: string;
  category: string;
  description: string;
  amountMinor: bigint;
}

export interface AnomalyFinding {
  kind: StatementAnomalyKind;
  severity: StatementAnomalySeverity;
  payload: Record<string, unknown>;
}

/** Line types that reduce the owner's payout. */
export const DEDUCTION_TYPES = new Set(["fee", "expense", "tax", "management_fee"]);

const abs = (n: bigint): bigint => (n < 0n ? -n : n);

/** Ratio of `part` to `whole` as a percentage with 0.1 precision. */
function pctOf(part: bigint, whole: bigint): number {
  if (whole === 0n) return 0;
  return Number((part * 1000n) / whole) / 10;
}

/**
 * Given a statement's lines and its net payout, return the anomaly findings.
 *
 * Rules (v1, conservative, sign-agnostic via absolute magnitudes):
 *  - one_off_charge   a single deduction line ≥ 40% of gross revenue (warn)
 *                     / ≥ 70% (critical) — a large non-recurring hit.
 *  - tax_anomaly      total tax ≥ 25% of gross revenue (warn) / ≥ 40%
 *                     (critical) — Indonesia PPN is ~11%, so this is high.
 *  - other            net payout < 0 (owner owes), or gross revenue is 0
 *                     while deductions exist (likely missing revenue).
 *
 * History-based rules (supplier_cost_spike vs a trailing baseline,
 * occupancy_drop, channel_mix_shift) are a documented follow-up.
 */
export function detectStatementAnomalies(
  lines: AnomalyLine[],
  netPayoutMinor: bigint,
): AnomalyFinding[] {
  const findings: AnomalyFinding[] = [];

  const grossRevenue = lines
    .filter((l) => l.lineType === "revenue")
    .reduce((s, l) => s + abs(l.amountMinor), 0n);

  if (grossRevenue > 0n) {
    for (const l of lines) {
      if (!DEDUCTION_TYPES.has(l.lineType)) continue;
      const pct = pctOf(abs(l.amountMinor), grossRevenue);
      if (pct >= 40) {
        findings.push({
          kind: "one_off_charge",
          severity: pct >= 70 ? "critical" : "warn",
          payload: {
            lineId: l.id,
            lineType: l.lineType,
            category: l.category,
            description: l.description,
            amountMinor: l.amountMinor.toString(),
            pctOfGross: pct,
          },
        });
      }
    }

    const taxTotal = lines
      .filter((l) => l.lineType === "tax")
      .reduce((s, l) => s + abs(l.amountMinor), 0n);
    const taxPct = pctOf(taxTotal, grossRevenue);
    if (taxPct >= 25) {
      findings.push({
        kind: "tax_anomaly",
        severity: taxPct >= 40 ? "critical" : "warn",
        payload: { taxTotalMinor: taxTotal.toString(), pctOfGross: taxPct },
      });
    }
  } else if (lines.some((l) => DEDUCTION_TYPES.has(l.lineType))) {
    findings.push({
      kind: "other",
      severity: "warn",
      payload: { reason: "zero_revenue_with_deductions" },
    });
  }

  if (netPayoutMinor < 0n) {
    findings.push({
      kind: "other",
      severity: netPayoutMinor < -grossRevenue ? "critical" : "warn",
      payload: {
        reason: "negative_net_payout",
        netPayoutMinor: netPayoutMinor.toString(),
      },
    });
  }

  return findings;
}
