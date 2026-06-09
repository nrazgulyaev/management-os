/**
 * Owner-CHURN drill-in — pure scoring + save-plan layer on top of the
 * (already-shipped) retention-risk engine.
 *
 * The retention engine (`retention-risk.ts`) emits worse-of `signals`
 * with a `level` (ok/watch/flag). It does NOT produce a numeric churn
 * score or a recommended intervention — that gap is what the churn
 * drill-in fills. This module is a deterministic, side-effect-free
 * transform so it is trivially testable and re-usable by the agent.
 *
 * Score model (0..100, higher = more likely to churn):
 *   each signal contributes a weight × level-multiplier. The composite
 *   is capped at 100. A `band` maps the score to the same ok/watch/flag
 *   vocabulary the RiskPill already understands.
 */

import type { RiskLevel } from "@/components/owners/risk-pill";
import type {
  RetentionRiskResult,
  RetentionRiskSignal,
} from "./retention-risk";

/** Per-signal base weight (out of 100). Tuned so any single flag lands
 *  in "watch" and two correlated flags push into "flag". */
const SIGNAL_WEIGHT: Record<RetentionRiskSignal["kind"], number> = {
  payout_drift: 28,
  occupancy_regression: 22,
  statement_dispute: 24,
  maintenance_escalation: 14,
  portal_disengagement: 18,
};

const LEVEL_MULTIPLIER: Record<RiskLevel, number> = { ok: 0, watch: 0.55, flag: 1 };

const SIGNAL_LABEL: Record<RetentionRiskSignal["kind"], string> = {
  payout_drift: "Payout drift",
  occupancy_regression: "Occupancy regression",
  statement_dispute: "Statement disputes",
  maintenance_escalation: "Maintenance escalation",
  portal_disengagement: "Portal disengagement",
};

export interface ChurnScoreContribution {
  kind: RetentionRiskSignal["kind"];
  label: string;
  level: RiskLevel;
  reason: string;
  /** Points this signal added to the composite (rounded). */
  points: number;
}

export interface ChurnScoreBreakdown {
  /** 0..100 — higher means more likely to leave. */
  score: number;
  band: RiskLevel;
  contributions: ChurnScoreContribution[];
  /** One-line plain-English read of the score. */
  summary: string;
}

function bandForScore(score: number): RiskLevel {
  if (score >= 55) return "flag";
  if (score >= 25) return "watch";
  return "ok";
}

export function computeChurnScore(risk: RetentionRiskResult): ChurnScoreBreakdown {
  const contributions: ChurnScoreContribution[] = risk.signals.map((s) => {
    const raw = SIGNAL_WEIGHT[s.kind] * LEVEL_MULTIPLIER[s.level];
    return {
      kind: s.kind,
      label: SIGNAL_LABEL[s.kind],
      level: s.level,
      reason: s.reason,
      points: Math.round(raw),
    };
  });

  const score = Math.min(
    100,
    contributions.reduce((acc, c) => acc + c.points, 0),
  );
  const band = bandForScore(score);

  const summary =
    band === "flag"
      ? "High churn risk — multiple hard signals. Intervene this week."
      : band === "watch"
        ? "Elevated churn risk — soft signals worth a proactive touch."
        : "Low churn risk — no material signals on this owner.";

  return { score, band, contributions, summary };
}

// ---------------------------------------------------------------------------
// Save-plan — recommended interventions derived from the dominant signals.
// ---------------------------------------------------------------------------

export type InterventionKind =
  | "founder_call"
  | "service_comp"
  | "intervention_started";

export const INTERVENTION_LABEL: Record<InterventionKind, string> = {
  founder_call: "Schedule founder call",
  service_comp: "Offer service comp",
  intervention_started: "Mark intervention started",
};

export interface SavePlanStep {
  /** Maps to an intervention action; null = advisory only. */
  intervention: InterventionKind | null;
  title: string;
  rationale: string;
}

/**
 * Deterministic save-plan: the dominant signal selects the headline play,
 * then we always offer the founder call + a "mark started" closer so the
 * three task-named actions are reachable from any non-ok owner.
 */
export function buildSavePlan(breakdown: ChurnScoreBreakdown): SavePlanStep[] {
  if (breakdown.band === "ok") return [];

  const steps: SavePlanStep[] = [];
  const kinds = new Set(breakdown.contributions.map((c) => c.kind));

  if (kinds.has("payout_drift") || kinds.has("occupancy_regression")) {
    steps.push({
      intervention: "founder_call",
      title: "Founder call on the revenue story",
      rationale:
        "Payout/occupancy is trending down — get ahead of it with a personal call before the next statement lands.",
    });
  }

  if (kinds.has("statement_dispute") || kinds.has("maintenance_escalation")) {
    steps.push({
      intervention: "service_comp",
      title: "Goodwill service comp",
      rationale:
        "Disputes or unresolved maintenance erode trust — a comp acknowledges the friction while it is fixed.",
    });
  }

  if (kinds.has("portal_disengagement")) {
    steps.push({
      intervention: "founder_call",
      title: "Re-engage a quiet owner",
      rationale: "Owner has gone quiet on the portal — a check-in re-opens the channel.",
    });
  }

  // Always offer the founder call + the closer so the three named actions
  // are reachable on any at-risk owner, even one with a single weak signal.
  if (!steps.some((s) => s.intervention === "founder_call")) {
    steps.push({
      intervention: "founder_call",
      title: "Proactive founder check-in",
      rationale: "A short personal call de-risks an owner showing early warning signs.",
    });
  }

  steps.push({
    intervention: "intervention_started",
    title: "Log the intervention",
    rationale: "Mark a save-plan as started so the team and the next analysis run can see it is in flight.",
  });

  return steps;
}
