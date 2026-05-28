/**
 * Phase 2.4 mgmt-04 — URGENT escalation timer.
 *
 * Critical UX rule 3: URGENT tagged request, when unresponsive for
 * 30 minutes, surfaces in the manager bell + opens a P1 ticket.
 * Pure fn so the agent + the dashboard share the same condition.
 */

export const URGENT_SLA_MS = 30 * 60 * 1000;

export interface RequestEscalationInput {
  priority: "urgent" | "high" | "normal" | "low";
  /** ISO timestamp of last staff/agent reply (null if none yet). */
  lastReplyAt: string | null;
  createdAt: string;
  resolvedAt?: string | null;
  now?: string;
}

export interface RequestEscalationResult {
  shouldEscalate: boolean;
  /** Milliseconds since the SLA-relevant clock started. */
  elapsedMs: number;
}

export function evaluateEscalation(input: RequestEscalationInput): RequestEscalationResult {
  if (input.priority !== "urgent" || input.resolvedAt) {
    return { shouldEscalate: false, elapsedMs: 0 };
  }
  const now = new Date(input.now ?? new Date().toISOString()).getTime();
  const start = new Date(input.lastReplyAt ?? input.createdAt).getTime();
  const elapsed = now - start;
  return { shouldEscalate: elapsed >= URGENT_SLA_MS, elapsedMs: elapsed };
}
