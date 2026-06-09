/**
 * Platform Admin OS — cross-org user directory queries.
 *
 * Reads `app_users` across every organization (the platform layer is
 * NOT tenant-scoped — it is gated purely on super_admin). Joins in:
 *   - the owning organization (app_users.organization_id → organizations)
 *   - MFA enrolment state (auth_mfa_factors — app-managed TOTP)
 *   - last successful sign-in (auth_login_attempts where succeeded)
 *   - role grants (user_roles → roles)
 *
 * Reads-only; every mutation lives in ./actions.ts. All helpers return
 * plain objects (no Drizzle row types leaked) so the consumer pages stay
 * easy to snapshot. `getDb()` may return null — every helper guards it
 * and returns an empty result so demo/no-DB flows do not crash.
 */

import "server-only";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { organizations } from "@/lib/db/schema/saas";
import { authMfaFactors, authLoginAttempts } from "@/lib/db/schema/security";

/** Inactive for ≥ this many days counts as "dormant". */
export const DORMANT_DAYS = 30;

export type UserDirectorySort = "last_sign_in" | "name" | "created";
export type UserDirectoryFilter =
  | "all"
  | "missing_mfa"
  | "dormant"
  | "admins";

export interface UserDirectoryRow {
  id: string;
  email: string;
  fullName: string;
  status: string;
  organizationId: string;
  organizationName: string | null;
  organizationCode: string | null;
  roleKeys: string[];
  mfaEnrolled: boolean;
  lastSignInAt: Date | null;
  createdAt: Date;
}

export interface ListUsersInput {
  search?: string;
  filter?: UserDirectoryFilter;
  /** Restrict to a single role key (e.g. "super_admin"). */
  role?: string;
  sort?: UserDirectorySort;
  dir?: "asc" | "desc";
  limit?: number;
}

function dormantCutoff(): Date {
  return new Date(Date.now() - DORMANT_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Cross-org user directory. Filters (missing MFA / dormant 30d+ / admins /
 * role) and the sort are applied in JS over the joined row-set; the row
 * count here is the platform's whole staff/owner population (hundreds,
 * not millions), so an in-memory sort is acceptable and keeps the SQL
 * simple. A hard `limit` (default 500) bounds the worst case.
 */
export async function listUsersAcrossOrgs(
  input: ListUsersInput = {},
): Promise<UserDirectoryRow[]> {
  const db = getDb();
  if (!db) return [];

  const limit = Math.min(input.limit ?? 500, 1000);

  // Base rows: every app_user + its owning org.
  const base = await db
    .select({
      id: appUsers.id,
      email: appUsers.email,
      fullName: appUsers.fullName,
      status: appUsers.status,
      organizationId: appUsers.organizationId,
      organizationName: organizations.name,
      organizationCode: organizations.organizationCode,
      createdAt: appUsers.createdAt,
    })
    .from(appUsers)
    .leftJoin(organizations, eq(organizations.id, appUsers.organizationId))
    .orderBy(desc(appUsers.createdAt))
    .limit(limit);

  if (base.length === 0) return [];

  const ids = base.map((r) => r.id);

  // MFA: any verified factor → enrolled.
  const mfaRows = await db
    .select({ appUserId: authMfaFactors.appUserId })
    .from(authMfaFactors)
    .where(
      and(
        inArray(authMfaFactors.appUserId, ids),
        eq(authMfaFactors.status, "verified"),
      ),
    );
  const mfaEnrolled = new Set(mfaRows.map((r) => r.appUserId));

  // Last successful sign-in per user.
  const signInRows = await db
    .select({
      appUserId: authLoginAttempts.appUserId,
      lastSignInAt: sql<Date>`max(${authLoginAttempts.createdAt})`,
    })
    .from(authLoginAttempts)
    .where(
      and(
        inArray(authLoginAttempts.appUserId, ids),
        eq(authLoginAttempts.succeeded, true),
      ),
    )
    .groupBy(authLoginAttempts.appUserId);
  const lastSignIn = new Map<string, Date>();
  for (const r of signInRows) {
    if (r.appUserId && r.lastSignInAt) {
      lastSignIn.set(r.appUserId, new Date(r.lastSignInAt));
    }
  }

  // Role keys per user.
  const roleRows = await db
    .select({ userId: userRoles.userId, key: roles.key })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(inArray(userRoles.userId, ids));
  const roleMap = new Map<string, string[]>();
  for (const r of roleRows) {
    const arr = roleMap.get(r.userId) ?? [];
    if (!arr.includes(r.key)) arr.push(r.key);
    roleMap.set(r.userId, arr);
  }

  let rows: UserDirectoryRow[] = base.map((r) => ({
    id: r.id,
    email: r.email,
    fullName: r.fullName,
    status: r.status,
    organizationId: r.organizationId,
    organizationName: r.organizationName ?? null,
    organizationCode: r.organizationCode ?? null,
    roleKeys: roleMap.get(r.id) ?? [],
    mfaEnrolled: mfaEnrolled.has(r.id),
    lastSignInAt: lastSignIn.get(r.id) ?? null,
    createdAt: r.createdAt,
  }));

  // ---- Filters ----
  const search = input.search?.trim().toLowerCase();
  if (search) {
    rows = rows.filter(
      (r) =>
        r.email.toLowerCase().includes(search) ||
        r.fullName.toLowerCase().includes(search) ||
        (r.organizationName?.toLowerCase().includes(search) ?? false) ||
        (r.organizationCode?.toLowerCase().includes(search) ?? false),
    );
  }

  if (input.role) {
    rows = rows.filter((r) => r.roleKeys.includes(input.role!));
  }

  const cutoff = dormantCutoff();
  switch (input.filter) {
    case "missing_mfa":
      rows = rows.filter((r) => !r.mfaEnrolled);
      break;
    case "dormant":
      rows = rows.filter(
        (r) => !r.lastSignInAt || r.lastSignInAt < cutoff,
      );
      break;
    case "admins":
      rows = rows.filter(
        (r) =>
          r.roleKeys.includes("super_admin") ||
          r.roleKeys.includes("org_admin") ||
          r.roleKeys.includes("admin"),
      );
      break;
    default:
      break;
  }

  // ---- Sort ----
  const sort = input.sort ?? "last_sign_in";
  const dir = input.dir ?? "desc";
  const mul = dir === "asc" ? 1 : -1;
  rows.sort((a, b) => {
    if (sort === "name") {
      return mul * a.fullName.localeCompare(b.fullName);
    }
    if (sort === "created") {
      return mul * (a.createdAt.getTime() - b.createdAt.getTime());
    }
    // last_sign_in — nulls always sort to the bottom regardless of dir.
    const at = a.lastSignInAt?.getTime() ?? null;
    const bt = b.lastSignInAt?.getTime() ?? null;
    if (at === null && bt === null) return 0;
    if (at === null) return 1;
    if (bt === null) return -1;
    return mul * (at - bt);
  });

  return rows;
}

export interface UserDirectoryCounts {
  all: number;
  missingMfa: number;
  dormant: number;
  admins: number;
}

/** Headline counts for the filter pills. Computed from the unfiltered set. */
export async function getUserDirectoryCounts(): Promise<UserDirectoryCounts> {
  const rows = await listUsersAcrossOrgs({ filter: "all", limit: 1000 });
  const cutoff = dormantCutoff();
  return {
    all: rows.length,
    missingMfa: rows.filter((r) => !r.mfaEnrolled).length,
    dormant: rows.filter((r) => !r.lastSignInAt || r.lastSignInAt < cutoff)
      .length,
    admins: rows.filter(
      (r) =>
        r.roleKeys.includes("super_admin") ||
        r.roleKeys.includes("org_admin") ||
        r.roleKeys.includes("admin"),
    ).length,
  };
}

// ============================================================================
// Per-user detail
// ============================================================================

export interface UserMembershipRow {
  roleKey: string;
  roleName: string;
  scopeType: string | null;
  scopeId: string | null;
}

export interface UserRecentLoginRow {
  succeeded: boolean;
  failureReason: string | null;
  createdAt: Date;
}

export interface UserDetail {
  id: string;
  authUserId: string | null;
  email: string;
  fullName: string;
  phone: string | null;
  whatsappPhone: string | null;
  avatarUrl: string | null;
  status: string;
  timezone: string;
  organizationId: string;
  organizationName: string | null;
  organizationCode: string | null;
  createdAt: Date;
  updatedAt: Date;
  mfa: {
    enrolled: boolean;
    pending: boolean;
    factorId: string | null;
    verifiedAt: Date | null;
    lastUsedAt: Date | null;
  };
  lastSignInAt: Date | null;
  memberships: UserMembershipRow[];
  recentLogins: UserRecentLoginRow[];
}

export async function getUserDetail(id: string): Promise<UserDetail | null> {
  const db = getDb();
  if (!db) return null;

  const [u] = await db
    .select({
      id: appUsers.id,
      authUserId: appUsers.authUserId,
      email: appUsers.email,
      fullName: appUsers.fullName,
      phone: appUsers.phone,
      whatsappPhone: appUsers.whatsappPhone,
      avatarUrl: appUsers.avatarUrl,
      status: appUsers.status,
      timezone: appUsers.timezone,
      organizationId: appUsers.organizationId,
      organizationName: organizations.name,
      organizationCode: organizations.organizationCode,
      createdAt: appUsers.createdAt,
      updatedAt: appUsers.updatedAt,
    })
    .from(appUsers)
    .leftJoin(organizations, eq(organizations.id, appUsers.organizationId))
    .where(eq(appUsers.id, id))
    .limit(1);
  if (!u) return null;

  // MFA — latest pending/verified factor.
  const [factor] = await db
    .select({
      id: authMfaFactors.id,
      status: authMfaFactors.status,
      verifiedAt: authMfaFactors.verifiedAt,
      lastUsedAt: authMfaFactors.lastUsedAt,
    })
    .from(authMfaFactors)
    .where(
      and(
        eq(authMfaFactors.appUserId, id),
        inArray(authMfaFactors.status, ["pending", "verified"]),
      ),
    )
    .orderBy(desc(authMfaFactors.createdAt))
    .limit(1);

  // Memberships — role grants (global + scoped).
  const memberships = await db
    .select({
      roleKey: roles.key,
      roleName: roles.name,
      scopeType: userRoles.scopeType,
      scopeId: userRoles.scopeId,
    })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .where(eq(userRoles.userId, id))
    .orderBy(roles.name);

  // Recent login attempts (success + failures) for the auth panel.
  const recentLogins = await db
    .select({
      succeeded: authLoginAttempts.succeeded,
      failureReason: authLoginAttempts.failureReason,
      createdAt: authLoginAttempts.createdAt,
    })
    .from(authLoginAttempts)
    .where(eq(authLoginAttempts.appUserId, id))
    .orderBy(desc(authLoginAttempts.createdAt))
    .limit(10);

  const lastSignInAt =
    recentLogins.find((r) => r.succeeded)?.createdAt ?? null;

  return {
    id: u.id,
    authUserId: u.authUserId,
    email: u.email,
    fullName: u.fullName,
    phone: u.phone,
    whatsappPhone: u.whatsappPhone,
    avatarUrl: u.avatarUrl,
    status: u.status,
    timezone: u.timezone,
    organizationId: u.organizationId,
    organizationName: u.organizationName ?? null,
    organizationCode: u.organizationCode ?? null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    mfa: {
      enrolled: factor?.status === "verified",
      pending: factor?.status === "pending",
      factorId: factor?.id ?? null,
      verifiedAt: factor?.verifiedAt ?? null,
      lastUsedAt: factor?.lastUsedAt ?? null,
    },
    lastSignInAt,
    memberships,
    recentLogins,
  };
}
