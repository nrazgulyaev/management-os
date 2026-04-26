import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema/identity";
import { owners } from "@/lib/db/schema/ownership";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import { getCurrentAuthUser } from "@/lib/supabase/server";
import type { WithSource } from "@/features/types";

export interface OwnerAccessGrantRow {
  id: string;
  appUserId: string;
  appUserEmail: string;
  appUserName: string;
  ownerId: string;
  ownerName: string;
  grantType: "owner_portal" | "investor_readonly" | "finance_approver";
  status: "active" | "revoked";
  grantedAt: string;
  grantedByName: string | null;
  revokedAt: string | null;
  notes: string | null;
}

const empty: WithSource<OwnerAccessGrantRow>[] = [];

export async function listOwnerAccessGrants(opts?: {
  ownerId?: string;
  appUserId?: string;
  status?: "active" | "revoked";
}): Promise<WithSource<OwnerAccessGrantRow>[]> {
  const db = getDb();
  if (!db) return empty;

  const filters = [];
  if (opts?.ownerId) filters.push(eq(appUsersOwners.ownerId, opts.ownerId));
  if (opts?.appUserId) filters.push(eq(appUsersOwners.appUserId, opts.appUserId));
  if (opts?.status) filters.push(eq(appUsersOwners.status, opts.status));

  const rows = await db
    .select({
      g: appUsersOwners,
      userEmail: appUsers.email,
      userName: appUsers.fullName,
      ownerName: owners.displayName,
    })
    .from(appUsersOwners)
    .innerJoin(appUsers, eq(appUsers.id, appUsersOwners.appUserId))
    .innerJoin(owners, eq(owners.id, appUsersOwners.ownerId))
    .where(filters.length ? and(...filters) : undefined)
    .orderBy(desc(appUsersOwners.grantedAt), asc(owners.displayName));

  // For each row resolve granted_by name (separate query keeps the join short).
  const grantorIds = [...new Set(rows.map((r) => r.g.grantedBy).filter(Boolean) as string[])];
  const grantorNames = new Map<string, string>();
  if (grantorIds.length > 0) {
    const grantors = await db
      .select({ id: appUsers.id, name: appUsers.fullName })
      .from(appUsers);
    for (const g of grantors) grantorNames.set(g.id, g.name);
  }

  return rows.map((r) => ({
    source: "db" as const,
    id: r.g.id,
    appUserId: r.g.appUserId,
    appUserEmail: r.userEmail,
    appUserName: r.userName,
    ownerId: r.g.ownerId,
    ownerName: r.ownerName,
    grantType: r.g.grantType as OwnerAccessGrantRow["grantType"],
    status: r.g.status as OwnerAccessGrantRow["status"],
    grantedAt: r.g.grantedAt.toISOString(),
    grantedByName: r.g.grantedBy ? grantorNames.get(r.g.grantedBy) ?? null : null,
    revokedAt: r.g.revokedAt?.toISOString() ?? null,
    notes: r.g.notes,
  }));
}

export async function listAccessGrantsForOwner(ownerId: string) {
  return listOwnerAccessGrants({ ownerId });
}

export async function listAccessGrantsForAppUser(appUserId: string) {
  return listOwnerAccessGrants({ appUserId });
}

/**
 * Resolve the owner_id list for the currently authenticated Supabase user.
 * Used by server-side code that needs to mirror the SQL `current_owner_ids()`
 * RLS function. Returns an empty array when DB / auth is missing.
 */
export async function getOwnerIdsForCurrentUser(): Promise<string[]> {
  const db = getDb();
  if (!db) return [];
  const auth = await getCurrentAuthUser();
  if (!auth) return [];
  const rows = await db
    .select({ ownerId: appUsersOwners.ownerId })
    .from(appUsersOwners)
    .innerJoin(appUsers, eq(appUsers.id, appUsersOwners.appUserId))
    .where(
      and(
        eq(appUsers.authUserId, auth.id),
        eq(appUsers.status, "active"),
        eq(appUsersOwners.status, "active"),
      ),
    );
  return rows.map((r) => r.ownerId);
}

/**
 * Helper used by actions to refuse duplicate active grants. Returns the
 * existing active grant id if one exists.
 */
export async function findActiveGrant(
  appUserId: string,
  ownerId: string,
  grantType: "owner_portal" | "investor_readonly" | "finance_approver",
): Promise<string | null> {
  const db = getDb();
  if (!db) return null;
  const [row] = await db
    .select()
    .from(appUsersOwners)
    .where(
      and(
        eq(appUsersOwners.appUserId, appUserId),
        eq(appUsersOwners.ownerId, ownerId),
        eq(appUsersOwners.grantType, grantType),
        eq(appUsersOwners.status, "active"),
      ),
    )
    .limit(1);
  return row?.id ?? null;
}
