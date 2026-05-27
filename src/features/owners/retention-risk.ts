/**
 * Phase 2.2 mgmt-03 — Owner retention risk.
 *
 * 5 signals per the cabinet doc. Each returns a level (ok/watch/
 * flag) + optional reason text. The composite is worse-of.
 *
 *   1. payout drift           −10% watch, −20% flag (vs 3-mo rolling)
 *   2. occupancy regression   YoY −15% watch, −25% flag (excludes Q1)
 *   3. portal disengagement   >30d watch, >90d + anomaly flag
 *   4. statement dispute      ≥2 revisions in 3mo → flag
 *   5. maintenance escalation ≥3 open >14d → watch
 */

import type { RiskLevel } from "@/components/owners/risk-pill";

export interface RetentionSignals {
  /** Pct vs 3-mo rolling average (e.g. -12 = down 12%). */
  payoutDriftPct: number;
  /** YoY pct (e.g. -18 = down 18% YoY). */
  occupancyYoyPct: number;
  /** Months in scope (1..12). When falsy = current month; used to
   *  exclude Q1 from the occupancy check (Q1 has inherent low-season
   *  bias). */
  monthIndex: number;
  /** Days since the owner last signed in to the portal. */
  daysSincePortalSignIn: number;
  /** True when there's an unread statement-anomaly notification. */
  hasUnreadAnomaly: boolean;
  /** Statement revisions in the trailing 3 months. */
  statementRevisions3mo: number;
  /** Maintenance tickets open > 14d. */
  openMaintenanceTickets: number;
}

export interface RetentionRiskSignal {
  kind:
    | "payout_drift"
    | "occupancy_regression"
    | "portal_disengagement"
    | "statement_dispute"
    | "maintenance_escalation";
  level: RiskLevel;
  reason: string;
}

export interface RetentionRiskResult {
  /** Worse-of across signals. */
  level: RiskLevel;
  signals: RetentionRiskSignal[];
}

function worse(a: RiskLevel, b: RiskLevel): RiskLevel {
  const rank: Record<RiskLevel, number> = { ok: 0, watch: 1, flag: 2 };
  return rank[a] >= rank[b] ? a : b;
}

export function computeRetentionRisk(input: RetentionSignals): RetentionRiskResult {
  const signals: RetentionRiskSignal[] = [];

  // 1. Payout drift
  if (input.payoutDriftPct <= -20) {
    signals.push({ kind: "payout_drift", level: "flag", reason: `Payout ${input.payoutDriftPct}% vs 3-mo avg` });
  } else if (input.payoutDriftPct <= -10) {
    signals.push({ kind: "payout_drift", level: "watch", reason: `Payout ${input.payoutDriftPct}% vs 3-mo avg` });
  }

  // 2. Occupancy regression (excludes Q1)
  const inQ1 = input.monthIndex >= 1 && input.monthIndex <= 3;
  if (!inQ1) {
    if (input.occupancyYoyPct <= -25) {
      signals.push({ kind: "occupancy_regression", level: "flag", reason: `Occupancy ${input.occupancyYoyPct}% YoY` });
    } else if (input.occupancyYoyPct <= -15) {
      signals.push({ kind: "occupancy_regression", level: "watch", reason: `Occupancy ${input.occupancyYoyPct}% YoY` });
    }
  }

  // 3. Portal disengagement
  if (input.daysSincePortalSignIn > 90 && input.hasUnreadAnomaly) {
    signals.push({
      kind: "portal_disengagement",
      level: "flag",
      reason: `${input.daysSincePortalSignIn}d offline + unread anomaly`,
    });
  } else if (input.daysSincePortalSignIn > 30) {
    signals.push({
      kind: "portal_disengagement",
      level: "watch",
      reason: `${input.daysSincePortalSignIn}d since last sign-in`,
    });
  }

  // 4. Statement dispute
  if (input.statementRevisions3mo >= 2) {
    signals.push({
      kind: "statement_dispute",
      level: "flag",
      reason: `${input.statementRevisions3mo} statement revisions in 3mo`,
    });
  }

  // 5. Maintenance escalation
  if (input.openMaintenanceTickets >= 3) {
    signals.push({
      kind: "maintenance_escalation",
      level: "watch",
      reason: `${input.openMaintenanceTickets} tickets open >14d`,
    });
  }

  const level = signals.reduce<RiskLevel>((acc, s) => worse(acc, s.level), "ok");
  return { level, signals };
}
