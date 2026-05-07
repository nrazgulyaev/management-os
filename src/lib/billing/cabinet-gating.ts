import "server-only";

/**
 * Stage 7.F.D.3 — Cabinet plan-tier gating.
 *
 * Maps cabinet slugs (the 9 hardcoded role cabinets) to their
 * `feature_flags` codes, then calls `pageGate(orgId, flagCode)` to
 * decide whether to redirect to the upgrade screen.
 *
 * Plan_features rows are seeded in migration 0085. Internal /
 * Enterprise / Pro plans see all cabinets; Standard sees 5; Basic +
 * Trial see only the owner cabinet (in this iteration the "owner
 * cabinet" maps to cabinets/owner — not in the current 9, but will
 * land when buyer-facing surfaces extend).
 *
 * For 7.F.D.3 we ship the helper + apply it to a sample cabinet to
 * prove the pattern. The remaining cabinets pick this up
 * incrementally.
 */

import { pageGate } from "./gating";
import { CABINET_TO_FLAG } from "./cabinet-flags";

export { CABINET_TO_FLAG };

/**
 * Returns redirect URL when the org's plan doesn't include this
 * cabinet, else null. Caller invokes redirect() on the return value.
 *
 * Pattern:
 *   const redirectTo = await gateCabinet(orgId, "cfo-accountant");
 *   if (redirectTo) redirect(redirectTo);
 */
export async function gateCabinet(
  organizationId: string,
  cabinetSlug: string,
): Promise<string | null> {
  const flag = CABINET_TO_FLAG[cabinetSlug];
  if (!flag) {
    // Cabinets without a flag mapping (e.g. my-cabinet) bypass gating.
    return null;
  }
  return pageGate(organizationId, flag);
}
