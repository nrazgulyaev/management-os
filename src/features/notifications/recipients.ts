// Recipient resolution for the notification delivery worker.
//
// Note: this module intentionally avoids `import "server-only"` (same
// convention as the provider modules) so the tenancy-scoping logic stays
// importable from `node:test`. It never opens a connection itself — the
// caller (delivery.ts, which IS server-only) injects the Drizzle client.

import { and, eq } from "drizzle-orm";
import type { DB } from "@/lib/db/client";
import { appUsers, roles, userRoles } from "@/lib/db/schema/identity";
import { appUsersOwners } from "@/lib/db/schema/access-grants";
import type { DeliveryChannel, RecipientType } from "./providers/types";

export interface ResolvedRecipient {
  appUserId: string | null;
  ownerId: string | null;
  roleKey: string | null;
  /** email/phone — only set when channel needs an external address. */
  recipientAddress: string | null;
  /** v8B — IANA timezone for quiet-hours evaluation. Falls back to
   *  Asia/Makassar when the recipient row has no timezone (e.g. owners
   *  without a linked app_user). */
  timezone: string;
}

export interface RecipientQueueRow {
  id: string;
  recipientType: string;
  recipientId: string | null;
  /** TENANCY — org anchor copied from notification_queue.organization_id.
   *  When set, recipient resolution is scoped to that organization; when
   *  null the row is platform-level (legacy producers that predate org
   *  threading + genuine platform broadcasts) and resolves platform-wide. */
  organizationId: string | null;
  channel: string;
  templateKey: string;
  title: string;
  body: string;
  payload: unknown;
  priority: string;
}

/**
 * Map a queue row to one or more concrete recipients for the chosen
 * channel. The worker calls `selectProvider(channel).send(...)` once per
 * recipient.
 *
 * Today:
 *   - internal_user → resolve email/phone from app_users
 *   - owner         → linked app_users via app_users_owners (channel-aware)
 *   - role          → every active internal app_user with that role
 *   - guest         → skipped for now (returns [] with reason)
 *
 * TENANCY (wave 4 fix) — when the queue row carries an organizationId,
 * resolution is constrained to that org via app_users.organization_id:
 * role fan-out only reaches that org's users, internal_user/owner targets
 * are rejected/filtered if they belong to a different org. A null
 * organizationId keeps the historical platform-wide behavior, which is
 * correct only for genuinely platform-level notifications.
 */
export async function resolveNotificationRecipients(
  notification: RecipientQueueRow,
  db: DB | null,
): Promise<{ recipients: ResolvedRecipient[]; reason?: string }> {
  if (!db) return { recipients: [], reason: "database unavailable" };

  const channel = notification.channel as DeliveryChannel;
  const recipientType = notification.recipientType as RecipientType;

  if (recipientType === "internal_user") {
    if (!notification.recipientId)
      return { recipients: [], reason: "internal_user without recipient_id" };
    const [user] = await db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        phone: appUsers.phone,
        timezone: appUsers.timezone,
      })
      .from(appUsers)
      .where(
        and(
          eq(appUsers.id, notification.recipientId),
          // TENANCY — an org-anchored notification must not deliver to a
          // user belonging to a different organization.
          ...(notification.organizationId
            ? [eq(appUsers.organizationId, notification.organizationId)]
            : []),
        ),
      )
      .limit(1);
    if (!user)
      return {
        recipients: [],
        reason: notification.organizationId
          ? "app_user not found in notification organization"
          : "app_user not found",
      };
    return {
      recipients: [
        {
          appUserId: user.id,
          ownerId: null,
          roleKey: null,
          recipientAddress: pickAddressForChannel(channel, user.email, user.phone),
          timezone: user.timezone,
        },
      ],
    };
  }

  if (recipientType === "owner") {
    if (!notification.recipientId)
      return { recipients: [], reason: "owner without recipient_id" };
    // The in_app provider can target the owner directly via owner_id even
    // when there's no linked app_user yet.
    if (channel === "in_app") {
      return {
        recipients: [
          {
            appUserId: null,
            ownerId: notification.recipientId,
            roleKey: null,
            recipientAddress: null,
            timezone: "Asia/Makassar",
          },
        ],
      };
    }
    // For external channels we need a linked app_user with an address.
    // TENANCY — when the queue row is org-anchored, only linked app_users
    // of that org receive the external delivery. (owners has no
    // organization_id column yet, so the in_app shortcut above cannot be
    // org-checked here; the in_app provider stamps the org on the inbox
    // row and the owner portal reads strictly by owner_id.)
    const linked = await db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        phone: appUsers.phone,
        timezone: appUsers.timezone,
      })
      .from(appUsersOwners)
      .innerJoin(appUsers, eq(appUsers.id, appUsersOwners.appUserId))
      .where(
        and(
          eq(appUsersOwners.ownerId, notification.recipientId),
          eq(appUsersOwners.status, "active"),
          eq(appUsers.status, "active"),
          ...(notification.organizationId
            ? [eq(appUsers.organizationId, notification.organizationId)]
            : []),
        ),
      );
    if (linked.length === 0) {
      return { recipients: [], reason: "no linked app_users for owner" };
    }
    return {
      recipients: linked
        .map((u) => ({
          appUserId: u.id,
          ownerId: notification.recipientId,
          roleKey: null,
          recipientAddress: pickAddressForChannel(channel, u.email, u.phone),
          timezone: u.timezone,
        }))
        .filter((r) => r.recipientAddress !== null),
    };
  }

  if (recipientType === "role") {
    const roleKey =
      typeof (notification.payload as Record<string, unknown> | null)?.recipientRole === "string"
        ? ((notification.payload as Record<string, unknown>).recipientRole as string)
        : null;
    if (!roleKey) {
      return { recipients: [], reason: "role recipient missing payload.recipientRole" };
    }
    // TENANCY (wave 4 fix) — role fan-out used to resolve PLATFORM-WIDE
    // (every active user with the role across all orgs), so e.g. a
    // cross-org "director" received other orgs' digests. When the queue
    // row carries an organizationId we now resolve only that org's users;
    // platform-wide fan-out remains only for organizationId = null rows.
    const users = await db
      .select({
        id: appUsers.id,
        email: appUsers.email,
        phone: appUsers.phone,
        timezone: appUsers.timezone,
      })
      .from(userRoles)
      .innerJoin(appUsers, eq(appUsers.id, userRoles.userId))
      .innerJoin(roles, eq(roles.id, userRoles.roleId))
      .where(
        and(
          eq(roles.key, roleKey),
          eq(appUsers.status, "active"),
          ...(notification.organizationId
            ? [eq(appUsers.organizationId, notification.organizationId)]
            : []),
        ),
      );
    if (users.length === 0) {
      return {
        recipients: [],
        reason: notification.organizationId
          ? `no active app_users for role ${roleKey} in notification organization`
          : `no active app_users for role ${roleKey}`,
      };
    }
    return {
      recipients: users.map((u) => ({
        appUserId: u.id,
        ownerId: null,
        roleKey,
        recipientAddress:
          channel === "in_app"
            ? null
            : pickAddressForChannel(channel, u.email, u.phone),
        timezone: u.timezone,
      })),
    };
  }

  if (recipientType === "guest") {
    // External delivery to guests is parked until v8B (the guest portal
    // ships a self-service preference flow). For now, in-app to a linked
    // app_user is impossible (guests don't have one yet); skip cleanly.
    return { recipients: [], reason: "guest delivery deferred to v8B" };
  }

  return { recipients: [], reason: `unknown recipient_type: ${recipientType}` };
}

function pickAddressForChannel(
  channel: DeliveryChannel,
  email: string | null,
  phone: string | null,
): string | null {
  if (channel === "email") return email;
  if (channel === "sms" || channel === "whatsapp") return phone;
  return null;
}
