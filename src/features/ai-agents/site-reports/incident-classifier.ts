/**
 * Phase 2.4 dev-01 — incident-classifier agent (stub).
 *
 * On every site-frame post with kind=incident, refines the
 * heuristic severity from classifySeverity() using the photo +
 * full text. When the refined severity = p1 OR keywords match
 * "shortage" / "defect", the agent auto-opens an RFI routed to
 * procurement or QS (Critical UX rule 2).
 */

import { classifySeverity } from "@/features/site-reports/severity";

export interface IncidentClassifierInput {
  organizationId: string;
  frameId: string;
  projectId: string;
  caption: string;
  narration?: string;
  photoRef?: string;
  tags?: string[];
}

export interface IncidentClassifierOutput {
  severity: "p1" | "p2" | "p3" | "info";
  reasoning: string;
  autoRfiOpened?: { id: string; routedTo: "procurement" | "qs" | "arch" | "struct" };
}

export async function classify(input: IncidentClassifierInput): Promise<IncidentClassifierOutput> {
  const severity = classifySeverity({ caption: input.caption, narration: input.narration, tags: input.tags });
  return { severity, reasoning: "Heuristic classification (LLM refinement pending)." };
}

export const INCIDENT_CLASSIFIER_AGENT = {
  agentCode: "incident-classifier",
  description: "Per-frame severity + auto-RFI for procurement / QS on flagged kinds.",
} as const;
