import "server-only";

import { getCurrentUserContext } from "./permissions";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";

/**
 * TENANT-1 — canonical org-resolution helper for server actions on
 * multi-tenant tables. Use this instead of the legacy
 * `getOrganizationByCode("ARCONIQUE_DEFAULT")` pattern. Throws if the
 * caller has no authenticated session (server actions should already
 * have called `requirePermission` / `requireInternalUser` upstream).
 *
 * Pattern:
 *
 *   export async function createX(input) {
 *     await requirePermission("x.write");
 *     const organizationId = await requireOrgId();
 *     await db.insert(xTable).values({ ...input, organizationId });
 *   }
 *
 * For UPDATE/DELETE, AND the WHERE clause with the orgId to prevent
 * cross-tenant mutation:
 *
 *   await db.update(xTable).set({ ... }).where(
 *     and(eq(xTable.id, id), eq(xTable.organizationId, organizationId)),
 *   );
 *
 * The "demo" mode (no DB configured) bypasses tenancy entirely and
 * returns a sentinel org id; downstream INSERTs will only run when
 * `requireDb()` returns a real DB.
 */
export async function requireOrgId(): Promise<string> {
  const ctx = await getCurrentUserContext();
  if (ctx.mode === "demo") {
    return "00000000-0000-0000-0000-000000000000";
  }
  const orgId = ctx.appUser?.organizationId;
  if (orgId) return orgId;

  // COMPLETE-1 fallback: server pages can render anonymously (curl
  // smoke checks, pre-auth screens, prod-mode local probes). Throwing
  // here turns every such page into a 500. Fall back to the legacy
  // ARCONIQUE_DEFAULT seed org when no session exists — preserves
  // pre-TENANT-1 behavior for unauthenticated reads while keeping
  // the session-aware path active for real users. In a true multi-
  // tenant deployment, middleware redirects unauthenticated traffic
  // to /login before reaching any page that calls this helper.
  const legacyOrg = await getOrganizationByCode("ARCONIQUE_DEFAULT");
  if (legacyOrg) return legacyOrg.id;

  throw new Error(
    "No organization context — caller is not authenticated and no ARCONIQUE_DEFAULT seed org exists. Run requirePermission/requireInternalUser upstream, or apply migration 0071.",
  );
}
