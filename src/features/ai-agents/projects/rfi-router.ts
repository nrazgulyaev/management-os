/**
 * Phase 2.2 dev-01 — rfi-router agent (stub).
 *
 * Called by `RFIComposeModal` on submit. Reads the question text +
 * any discipline hint and routes the RFI to the right contact:
 *
 *   architecture → project architect
 *   structural   → structural engineer
 *   mep          → MEP consultant
 *   interior     → interior designer
 *   other        → PM (fallback)
 *
 * Real classifier + Vault-backed model call land in 2.2 data-
 * wiring. The stub picks "architecture" so the modal can show a
 * confirmation chip end-to-end.
 */

export type RfiDiscipline = "architecture" | "structural" | "mep" | "interior" | "other";

export interface RouteRfiInput {
  projectId: string;
  question: string;
  /** Caller-supplied hint; "auto" means trust the agent. */
  disciplineHint?: RfiDiscipline | "auto";
}

export interface RouteRfiOutput {
  ref: string;
  discipline: RfiDiscipline;
  routedToContactId: string | null;
  /** Display name surfaced to the operator. */
  routedTo: string;
  /** 0..100. */
  confidence: number;
}

export async function route(input: RouteRfiInput): Promise<RouteRfiOutput> {
  // PR 2.2 dev-01 — stub. Real routing reads project_contacts table
  // for the org's discipline roster; emits an `rfis` row + agent
  // invocation log. Confidence comes from the underlying classifier.
  const hinted =
    input.disciplineHint && input.disciplineHint !== "auto"
      ? input.disciplineHint
      : null;
  const discipline: RfiDiscipline = hinted ?? "architecture";
  return {
    ref: `RFI-${String(Date.now()).slice(-6)}`,
    discipline,
    routedToContactId: null,
    routedTo: hinted ? "Hinted discipline" : "Auto-routed · architect",
    confidence: hinted ? 100 : 78,
  };
}

export const RFI_ROUTER_AGENT = {
  agentCode: "rfi-router",
  description:
    "Classifies an RFI to a discipline (architecture / structural / MEP / interior) and picks the on-roster contact.",
} as const;
