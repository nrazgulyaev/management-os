/**
 * Readiness gate (FC-MANAGEMENT-FRONT-OFFICE §readiness): a check-in can't be
 * approved (door code issued) until the villa is ready. Pure + shared so the
 * Front office UI disables the Approve button and the server action enforces
 * the same rule (defence-in-depth, MASTER §6).
 *
 * We block only on a KNOWN not-ready state. `ready` and `unknown` (no readiness
 * record tracked for this villa) are allowed, so untracked villas aren't bricked.
 */
export const READINESS_NOT_READY: ReadonlySet<string> = new Set([
  "cleaning",
  "dirty",
  "inspection",
  "occupied",
  "out_of_order",
  "maintenance_block",
]);

export function readinessBlocksCheckin(status: string | null | undefined): boolean {
  return READINESS_NOT_READY.has((status ?? "").trim());
}
