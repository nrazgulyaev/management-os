/**
 * Stage 5.D — Project-Aware AI Memory pure helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Three composable helpers used by every agent:
 *   - rankMemoryByRelevance: scores items by recency × confidence × observations
 *   - summarizeMemoryForAgent: produces a markdown context block within a token budget
 *   - detectMemoryConflict: deduplicates / supersedes when ingesting new memories
 */

export type MemoryType =
  | "decision_summary"
  | "supplier_pattern"
  | "cost_pattern"
  | "schedule_pattern"
  | "team_observation"
  | "risk_observation"
  | "communication_pattern"
  | "product_specification"
  | "site_condition"
  | "regulatory_note"
  | "design_evolution"
  | "quality_observation"
  | "general_lesson_learned";

export type ConfidenceLevel = "low" | "medium" | "high";

export interface MemoryItem {
  id: string;
  type: MemoryType;
  title: string;
  summary: string;
  detail?: string;
  confidenceLevel: ConfidenceLevel;
  observedCount: number;
  tags: string[];
  /** ISO date string. */
  lastObservedAt: Date | null;
}

export interface RankWeights {
  recencyWeight: number;
  confidenceWeight: number;
  observationCountWeight: number;
}

export const DEFAULT_RANK_WEIGHTS: RankWeights = {
  recencyWeight: 0.4,
  confidenceWeight: 0.4,
  observationCountWeight: 0.2,
};

const MS_PER_DAY = 24 * 60 * 60 * 1000;

function confidenceScore(c: ConfidenceLevel | null | undefined): number {
  if (c === "high") return 1;
  if (c === "medium") return 0.6;
  if (c === "low") return 0.3;
  return 0;
}

function recencyScore(observedAt: Date | null, now = new Date()): number {
  if (!observedAt) return 0;
  const days = Math.max(0, (now.getTime() - observedAt.getTime()) / MS_PER_DAY);
  // Decay: 0d → 1.0, 30d → ~0.5, 90d → ~0.2, 365d → ~0.0
  return Math.max(0, 1 - days / 365);
}

function observationScore(count: number): number {
  // 1 obs → 0.2, 3 → ~0.5, 10 → ~0.85, 25+ → 1
  return Math.min(1, Math.log10(Math.max(1, count) + 9) / Math.log10(35));
}

/**
 * Rank a list of memory items by overall relevance. Higher score = more
 * relevant. Pure function — same input, same order.
 */
export function rankMemoryByRelevance(
  memories: MemoryItem[],
  weights: RankWeights = DEFAULT_RANK_WEIGHTS,
  now = new Date(),
): Array<MemoryItem & { _score: number }> {
  return memories
    .map((m) => {
      const r = recencyScore(m.lastObservedAt, now);
      const c = confidenceScore(m.confidenceLevel);
      const o = observationScore(m.observedCount);
      const score =
        r * weights.recencyWeight +
        c * weights.confidenceWeight +
        o * weights.observationCountWeight;
      return { ...m, _score: score };
    })
    .sort((a, b) => b._score - a._score);
}

/**
 * Render a markdown context block suitable for prepending to an agent prompt.
 * Truncates to fit in `maxTokens` using a rough chars-per-token heuristic.
 */
export function summarizeMemoryForAgent(
  memories: MemoryItem[],
  maxTokens: number,
): string {
  if (memories.length === 0) {
    return "## Project memory\n\n(no relevant memory items found)\n";
  }
  const headerCharCount = 30; // "## Project memory\n\n"
  // Heuristic: 1 token ≈ 4 chars (conservative).
  const charBudget = Math.max(50, maxTokens * 4 - headerCharCount);
  const lines: string[] = ["## Project memory", ""];
  let used = 0;
  for (const m of memories) {
    const line = `- **[${m.type}] ${m.title}** (${m.confidenceLevel}, observed ${m.observedCount}×): ${m.summary}`;
    if (used + line.length + 1 > charBudget) break;
    lines.push(line);
    used += line.length + 1;
  }
  lines.push("");
  return lines.join("\n");
}

export interface ConflictResult {
  hasConflict: boolean;
  conflictsWith: string[];
  suggestion:
    | "create_new"
    | "update_existing"
    | "supersede_existing"
    | "increment_count";
}

/**
 * Detect whether a candidate memory conflicts with (or duplicates) existing
 * items. Heuristic — same type + similar title => increment_count; same type
 * + contradictory summary => supersede_existing.
 */
export function detectMemoryConflict(
  candidate: { type: MemoryType; title: string; summary: string },
  existing: MemoryItem[],
): ConflictResult {
  const sameType = existing.filter((e) => e.type === candidate.type);
  if (sameType.length === 0) {
    return {
      hasConflict: false,
      conflictsWith: [],
      suggestion: "create_new",
    };
  }
  const titleNorm = candidate.title.trim().toLowerCase();
  const summaryNorm = candidate.summary.trim().toLowerCase();
  const exactTitleMatch = sameType.filter(
    (e) => e.title.trim().toLowerCase() === titleNorm,
  );
  if (exactTitleMatch.length > 0) {
    // Same title — does the summary match?
    const summaryMatches = exactTitleMatch.filter(
      (e) => e.summary.trim().toLowerCase() === summaryNorm,
    );
    if (summaryMatches.length > 0) {
      return {
        hasConflict: false,
        conflictsWith: summaryMatches.map((e) => e.id),
        suggestion: "increment_count",
      };
    }
    // Same title, different summary → supersede.
    return {
      hasConflict: true,
      conflictsWith: exactTitleMatch.map((e) => e.id),
      suggestion: "supersede_existing",
    };
  }
  // Substring overlap test — same type, partial title overlap.
  const partial = sameType.filter(
    (e) =>
      e.title.toLowerCase().includes(titleNorm.slice(0, 12)) ||
      titleNorm.includes(e.title.toLowerCase().slice(0, 12)),
  );
  if (partial.length > 0) {
    return {
      hasConflict: false,
      conflictsWith: partial.map((e) => e.id),
      suggestion: "update_existing",
    };
  }
  return { hasConflict: false, conflictsWith: [], suggestion: "create_new" };
}

// ---------------------------------------------------------------------------
// Budget + rate-limit checks (pure)
// ---------------------------------------------------------------------------

export interface BudgetWindow {
  spentDailyMinor: number;
  spentMonthlyMinor: number;
  invocationsLastHour: number;
  invocationsToday: number;
}

export interface BudgetCaps {
  dailyBudgetMinor: number;
  monthlyBudgetMinor: number;
  perInvocationBudgetMinor: number;
  maxInvocationsPerHour: number | null;
  maxInvocationsPerDay: number | null;
}

export type BudgetVerdict =
  | { allowed: true }
  | {
      allowed: false;
      reason:
        | "daily_budget_exceeded"
        | "monthly_budget_exceeded"
        | "rate_limit_hour"
        | "rate_limit_day";
    };

export function enforceAgentBudget(args: {
  estimatedCostMinor: number;
  caps: BudgetCaps;
  window: BudgetWindow;
}): BudgetVerdict {
  const { estimatedCostMinor, caps, window } = args;
  if (caps.dailyBudgetMinor > 0) {
    if (window.spentDailyMinor + estimatedCostMinor > caps.dailyBudgetMinor) {
      return { allowed: false, reason: "daily_budget_exceeded" };
    }
  }
  if (caps.monthlyBudgetMinor > 0) {
    if (window.spentMonthlyMinor + estimatedCostMinor > caps.monthlyBudgetMinor) {
      return { allowed: false, reason: "monthly_budget_exceeded" };
    }
  }
  if (
    caps.maxInvocationsPerHour != null &&
    window.invocationsLastHour >= caps.maxInvocationsPerHour
  ) {
    return { allowed: false, reason: "rate_limit_hour" };
  }
  if (
    caps.maxInvocationsPerDay != null &&
    window.invocationsToday >= caps.maxInvocationsPerDay
  ) {
    return { allowed: false, reason: "rate_limit_day" };
  }
  return { allowed: true };
}
