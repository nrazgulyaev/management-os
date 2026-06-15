import "server-only";

/**
 * Org-scoped reads for the push-notification composer.
 *
 * Every query filters on the caller's organization (requireOrgId), per the
 * TENANCY build contract — the DB role is BYPASSRLS so there is no RLS net.
 *
 *   - listOrgUsers          → app_users in the org (for target = user)
 *   - listOrgSubscriptions  → active push_subscriptions in the org
 *                             (for target = subscription)
 *   - listOrgRoleKeys       → role keys actually assigned to org users
 *                             (for target = role); `roles` itself is a global
 *                             definition table, so we derive the *available*
 *                             set from this org's user_roles assignments.
 *   - listRecentDispatches  → notification_dispatch_log rows for the org,
 *                             newest first (surfaces dispatchCode + status).
 */

import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { notificationDispatchLog, pushSubscriptions } from "@/lib/db/schema/pwa";
import { requireOrgId } from "@/features/auth/require-org";

export interface OrgUserLite {
  id: string;
  fullName: string;
  email: string;
}

export interface OrgSubscriptionLite {
  id: string;
  deviceLabel: string | null;
  deviceType: string | null;
  userFullName: string | null;
}

export interface OrgRoleLite {
  key: string;
  name: string;
}

export interface DispatchRow {
  id: string;
  dispatchCode: string;
  notificationType: string;
  title: string;
  targetRole: string | null;
  targetUserId: string | null;
  targetSubscriptionId: string | null;
  dispatchStatus: string;
  scheduledAt: Date;
  createdAt: Date;
}

export async function listOrgUsers(): Promise<OrgUserLite[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select({
      id: appUsers.id,
      fullName: appUsers.fullName,
      email: appUsers.email,
    })
    .from(appUsers)
    .where(
      and(
        eq(appUsers.organizationId, organizationId),
        eq(appUsers.status, "active"),
      ),
    )
    .orderBy(appUsers.fullName);
}

export async function listOrgSubscriptions(): Promise<OrgSubscriptionLite[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select({
      id: pushSubscriptions.id,
      deviceLabel: pushSubscriptions.deviceLabel,
      deviceType: pushSubscriptions.deviceType,
      userFullName: appUsers.fullName,
    })
    .from(pushSubscriptions)
    .leftJoin(appUsers, eq(appUsers.id, pushSubscriptions.userId))
    .where(
      and(
        eq(pushSubscriptions.organizationId, organizationId),
        eq(pushSubscriptions.isActive, true),
      ),
    )
    .orderBy(desc(pushSubscriptions.subscribedAt));
}

export async function listOrgRoleKeys(): Promise<OrgRoleLite[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  const rows = await db
    .selectDistinct({ key: roles.key, name: roles.name })
    .from(userRoles)
    .innerJoin(roles, eq(roles.id, userRoles.roleId))
    .innerJoin(appUsers, eq(appUsers.id, userRoles.userId))
    .where(eq(appUsers.organizationId, organizationId))
    .orderBy(roles.name);
  return rows;
}

export async function listRecentDispatches(
  limit = 50,
): Promise<DispatchRow[]> {
  const db = getDb();
  if (!db) return [];
  const organizationId = await requireOrgId();
  return db
    .select({
      id: notificationDispatchLog.id,
      dispatchCode: notificationDispatchLog.dispatchCode,
      notificationType: notificationDispatchLog.notificationType,
      title: notificationDispatchLog.title,
      targetRole: notificationDispatchLog.targetRole,
      targetUserId: notificationDispatchLog.targetUserId,
      targetSubscriptionId: notificationDispatchLog.targetSubscriptionId,
      dispatchStatus: notificationDispatchLog.dispatchStatus,
      scheduledAt: notificationDispatchLog.scheduledAt,
      createdAt: notificationDispatchLog.createdAt,
    })
    .from(notificationDispatchLog)
    .where(eq(notificationDispatchLog.organizationId, organizationId))
    .orderBy(desc(notificationDispatchLog.createdAt))
    .limit(limit);
}
