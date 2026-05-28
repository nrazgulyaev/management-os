/**
 * Phase 2.4 dev-01 — Site-frame incident severity classifier.
 *
 * Pure rule-based first pass before the LLM agent. Inputs are the
 * caption + narration + tag flags (mode keywords like "leak",
 * "delay", "stop work"). LLM refines later via the
 * incident-classifier agent.
 *
 * Severity ladder:
 *   p1   — life safety, schedule >7d, cost > 50M IDR
 *   p2   — work-affecting; schedule 1-7d, cost 10-50M
 *   p3   — minor; <1d, < 10M
 *   info — observational, no action needed
 */

export type SiteIncidentSeverity = "p1" | "p2" | "p3" | "info";

export interface SeverityInput {
  caption: string;
  narration?: string;
  /** Free-form keyword tags. */
  tags?: string[];
  /** Caller's estimate of schedule impact in days, if any. */
  estScheduleDays?: number;
  /** Caller's estimate of cost impact in major units. */
  estCostIdr?: number;
}

const P1_KEYWORDS = [
  "injury",
  "injured",
  "leak",
  "collapse",
  "fire",
  "stop work",
  "stop-work",
  "evac",
  "structural",
  "fatality",
];
const P2_KEYWORDS = ["shortage", "defect", "rework", "redo", "delay", "rfi"];

function tokenize(input: SeverityInput): string {
  return [input.caption, input.narration ?? "", ...(input.tags ?? [])].join(" ").toLowerCase();
}

export function classifySeverity(input: SeverityInput): SiteIncidentSeverity {
  const text = tokenize(input);

  const containsAny = (words: string[]) => words.some((w) => text.includes(w));

  if (containsAny(P1_KEYWORDS)) return "p1";
  if (input.estScheduleDays != null && input.estScheduleDays > 7) return "p1";
  if (input.estCostIdr != null && input.estCostIdr > 50_000_000) return "p1";

  if (containsAny(P2_KEYWORDS)) return "p2";
  if (input.estScheduleDays != null && input.estScheduleDays >= 1) return "p2";
  if (input.estCostIdr != null && input.estCostIdr >= 10_000_000) return "p2";

  if (input.estScheduleDays != null || input.estCostIdr != null) return "p3";
  return "info";
}
