/**
 * Phase 2.4 dev-02 — Sales pipeline stage machine.
 *
 * 6 stages (Lead / Qualified / Tour / Contract / Closed-Won /
 * Lost). The kanban drag emits transitions; this module is the
 * pure rule layer:
 *   - allowedTransitions(from)        — which lanes can a card move to
 *   - isTerminal(stage)               — closed-won and lost are read-only
 *   - stampEvent(from, to, actor)     — produces the audit event payload
 */

export type SalesStage = "lead" | "qualified" | "tour" | "contract" | "closed_won" | "lost";

const TERMINALS: SalesStage[] = ["closed_won", "lost"];

const FORWARD: Record<SalesStage, SalesStage[]> = {
  lead: ["qualified", "lost"],
  qualified: ["tour", "lead", "lost"],
  tour: ["contract", "qualified", "lost"],
  contract: ["closed_won", "tour", "lost"],
  closed_won: [],
  lost: ["lead"],
};

export function allowedTransitions(from: SalesStage): SalesStage[] {
  return [...FORWARD[from]];
}

export function isTerminal(stage: SalesStage): boolean {
  return TERMINALS.includes(stage);
}

export interface StageEventPayload {
  fromStage: SalesStage;
  toStage: SalesStage;
  at: string;
  actorUserId: string;
  /** True when the kanban drag emitted the event (vs explicit lane change). */
  autoStamped: boolean;
  note?: string;
}

export function stampEvent(
  from: SalesStage,
  to: SalesStage,
  actorUserId: string,
  options: { autoStamped?: boolean; note?: string } = {},
): StageEventPayload | null {
  if (!allowedTransitions(from).includes(to)) return null;
  return {
    fromStage: from,
    toStage: to,
    at: new Date().toISOString(),
    actorUserId,
    autoStamped: options.autoStamped ?? true,
    note: options.note,
  };
}
