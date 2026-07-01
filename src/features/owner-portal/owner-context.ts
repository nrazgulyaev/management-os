import "server-only";

import { cookies } from "next/headers";
import { eq, and, sql } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { owners } from "@/lib/db/schema/ownership";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { isSuperAdminContext } from "@/features/auth/require-super-admin";

/**
 * Sprint OWNER-PORTAL-1A — Owner context resolver.
 *
 * Returns the owner record the current user is viewing as. Three
 * possible paths:
 *
 *   1. The user has an active `app_users_owners` grant of type
 *      'owner_portal' for an owner → that owner is the context.
 *   2. The user is a super_admin AND the impersonation cookie names
 *      a specific owner → that owner is the context (impersonation).
 *   3. Otherwise → null (no owner context; layout redirects).
 *
 * Bound to TENANT-1: the resolved owner is implicitly scoped via the
 * grants/ownership_shares chain. Owners themselves have no
 * organization_id column; their tenant scope flows from the linked
 * villa's project → org.
 */

const IMPERSONATION_COOKIE = "__arconique_owner_impersonation";

export interface OwnerContext {
  ownerId: string;
  ownerName: string;
  ownerEmail: string | null;
  isImpersonating: boolean;
  impersonatedBy: string | null; // app_user.id when impersonating
}

async function loadOwnerById(ownerId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ id: owners.id, displayName: owners.displayName, email: owners.email })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .limit(1);
  return row ?? null;
}

async function loadGrantOwnerForUser(appUserId: string) {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select({ ownerId: appUsersOwners.ownerId })
    .from(appUsersOwners)
    .where(
      and(
        eq(appUsersOwners.appUserId, appUserId),
        eq(appUsersOwners.status, "active"),
        eq(appUsersOwners.grantType, "owner_portal"),
      ),
    )
    .limit(1);
  return row?.ownerId ?? null;
}

export async function getCurrentOwnerContext(): Promise<OwnerContext | null> {
  const user = await getCurrentAppUser();
  if (!user) return null;

  // Path 1 — direct grant.
  const grantedOwnerId = await loadGrantOwnerForUser(user.id);
  if (grantedOwnerId) {
    const owner = await loadOwnerById(grantedOwnerId);
    if (owner) {
      return {
        ownerId: owner.id,
        ownerName: owner.displayName,
        ownerEmail: owner.email,
        isImpersonating: false,
        impersonatedBy: null,
      };
    }
  }

  // Path 2 — PLATFORM super_admin impersonation. The impersonation COOKIE is
  // only set by the allowlist-gated start action, but resolve through the same
  // allowlist (isSuperAdminContext) so a tenant admin holding super_admin can
  // never resolve a cross-tenant owner even if a cookie were present.
  const store = await cookies();
  const cookie = store.get(IMPERSONATION_COOKIE);
  if (!cookie?.value) return null;

  const { ok: isPlatformAdmin } = await isSuperAdminContext();
  if (!isPlatformAdmin) {
    return null;
  }
  const owner = await loadOwnerById(cookie.value);
  if (!owner) return null;
  return {
    ownerId: owner.id,
    ownerName: owner.displayName,
    ownerEmail: owner.email,
    isImpersonating: true,
    impersonatedBy: user.id,
  };
}

/**
 * Org-id resolver from an owner's villa-ownership chain. Owners have
 * no org_id column directly; we hop owner → ownership_shares.villa_id
 * → villas.project_id → projects.organization_id (when present).
 *
 * Returns null when the chain is empty (orphan owner) or projects has
 * no org_id column at the DB layer (legacy state).
 */
export async function getOwnerOrgId(ownerId: string): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  // projects.organization_id may not exist yet (added on org tables by
  // migration 0072, but `projects` was never migrated — confirmed by
  // STATEMENT-1 audit). Fall back to the authenticated user's org_id
  // when the JOIN is empty.
  try {
    const r = await db.execute<{ org_id: string | null }>(sql`
      SELECT p.organization_id::text AS org_id
        FROM ownership_shares os
        JOIN villas v ON v.id = os.villa_id
        JOIN projects p ON p.id = v.project_id
       WHERE os.owner_id = ${ownerId}::uuid
         AND os.status = 'active'
       LIMIT 1
    `);
    const rows = rowsOf<{ org_id: string | null }>(r);
    if (rows[0]?.org_id) return rows[0].org_id;
  } catch {
    // Column doesn't exist — fall through.
  }
  const user = await getCurrentAppUser();
  return user?.organizationId ?? null;
}

export { IMPERSONATION_COOKIE };
