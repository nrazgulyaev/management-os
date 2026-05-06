/**
 * Pure readiness-lifecycle helpers. No `server-only` import — safe for
 * tests. The DB-aware transition logic lives in `services.ts`.
 */

export const READINESS_STATUSES = [
  "unknown",
  "dirty",
  "cleaning",
  "inspection",
  "ready",
  "occupied",
  "maintenance_block",
  "out_of_order",
] as const;

export type ReadinessStatus = (typeof READINESS_STATUSES)[number];

/**
 * Map an operation-task lifecycle event to the implied readiness state.
 * Only the safe / unambiguous mappings are wired — maintenance and
 * concierge tasks deliberately don't auto-bump readiness.
 */
export const TASK_TO_READINESS: Record<string, ReadinessStatus> = {
  "housekeeping:open": "dirty",
  "housekeeping:in_progress": "cleaning",
  "housekeeping:needs_review": "inspection",
  "housekeeping:approved": "ready",
  "housekeeping:completed": "ready",
};

export function readinessFromTaskUpdate(
  category: string,
  status: string,
): ReadinessStatus | null {
  return TASK_TO_READINESS[`${category}:${status}`] ?? null;
}
