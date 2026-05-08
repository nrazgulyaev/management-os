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
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";

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

/**
 * Stage 8.A.3 — convenience wrapper used by cabinet pages.
 *
 * Resolves the current org via the same `ARCONIQUE_DEFAULT` fallback
 * pattern other dev-os pages use (see settings/data-export, settings/
 * api-keys), then delegates to `gateCabinet`. If no org is reachable
 * (DB unconfigured or seed not yet loaded), gating is bypassed so the
 * page still renders — gating is a billing surface, not a security
 * boundary, and server actions inside the page remain RBAC-protected
 * regardless.
 *
 * Pattern:
 *   const redirectTo = await gateCabinetForCurrentOrg("qs");
 *   if (redirectTo) redirect(redirectTo);
 */
export async function gateCabinetForCurrentOrg(
  cabinetSlug: string,
): Promise<string | null> {
  try {
    const org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
    if (!org) return null;
    return gateCabinet(org.id, cabinetSlug);
  } catch {
    // DB unreachable / org-resolver error — let the page render. The
    // gate is best-effort billing UX, not a security check.
    return null;
  }
}
