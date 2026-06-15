"use server";

/**
 * Wire-up — "use server" adapter for the push-notification composer.
 *
 * `schedulePushNotification` (src/lib/development/server/notifications/
 * notification-actions.ts) is `import "server-only"` + positional-with-
 * object-input, so a "use client" island cannot import it directly. This
 * thin adapter:
 *   - gates on `notifications.manage` (send/dispatch is a manage-level op,
 *     mirroring the notification-rules admin surface),
 *   - normalizes the composer's flat `{ target, targetValue }` form into the
 *     action's `targetUserId | targetSubscriptionId | targetRole` shape,
 *     enforcing that the chosen user lives in the caller's org (IDOR guard),
 *   - records an audit event + revalidates the compose path,
 *   - returns `{ ok:true, dispatchCode } | { ok:false, error }`.
 *
 * The underlying action already enforces org-scoping (requireOrgId) on the
 * INSERT; this adapter adds the permission gate, the cross-tenant user check,
 * and the audit trail per the TENANCY build contract.
 */

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/lib/db/client";
import { appUsers } from "@/lib/db/schema/identity";
import { pushSubscriptions } from "@/lib/db/schema/pwa";
import { requirePermission } from "@/features/auth/permissions";
import { requireOrgId } from "@/features/auth/require-org";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { recordAuditEvent } from "@/features/audit/services";
import { schedulePushNotification } from "@/lib/development/server/notifications/notification-actions";

const COMPOSE_PATH =
  "/development-os/settings/notifications-push/compose";

export type ComposePushResult =
  | { ok: true; dispatchCode?: string }
  | { ok: false; error: string };

const composeSchema = z.object({
  title: z.string().min(2).max(200),
  body: z.string().min(2).max(500),
  notificationType: z.string().min(1),
  target: z.enum(["role", "user", "subscription"]),
  targetValue: z.string().min(1),
});

export interface ComposePushInput {
  title: string;
  body: string;
  notificationType: string;
  target: "role" | "user" | "subscription";
  /** role key (role), app_user id (user), or push_subscription id (subscription). */
  targetValue: string;
}

export async function composePushNotificationAction(
  input: ComposePushInput,
): Promise<ComposePushResult> {
  try {
    await requirePermission("notifications.manage");
    const organizationId = await requireOrgId();

    const parsed = composeSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.issues[0]?.message ?? "Invalid notification.",
      };
    }
    const data = parsed.data;

    const db = getDb();
    if (!db) return { ok: false, error: "DB not configured." };

    // Resolve the flat target into the action's discrete fields, enforcing
    // that user / subscription targets belong to the caller's org.
    let targetRole: string | undefined;
    let targetUserId: string | undefined;
    let targetSubscriptionId: string | undefined;

    if (data.target === "role") {
      targetRole = data.targetValue;
    } else if (data.target === "user") {
      const u = await db
        .select({ id: appUsers.id })
        .from(appUsers)
        .where(
          and(
            eq(appUsers.id, data.targetValue),
            eq(appUsers.organizationId, organizationId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);
      if (!u) return { ok: false, error: "User not found in this organization." };
      targetUserId = u.id;
    } else {
      const s = await db
        .select({ id: pushSubscriptions.id })
        .from(pushSubscriptions)
        .where(
          and(
            eq(pushSubscriptions.id, data.targetValue),
            eq(pushSubscriptions.organizationId, organizationId),
          ),
        )
        .limit(1)
        .then((rows) => rows[0]);
      if (!s) {
        return {
          ok: false,
          error: "Subscription not found in this organization.",
        };
      }
      targetSubscriptionId = s.id;
    }

    const res = await schedulePushNotification({
      notificationType: data.notificationType,
      title: data.title,
      body: data.body,
      targetRole,
      targetUserId,
      targetSubscriptionId,
      sourceType: "manual_composer",
    });

    if (!res.ok) {
      return { ok: false, error: res.error ?? "Failed to schedule push." };
    }

    const me = await getCurrentAppUser();
    await recordAuditEvent({
      actorUserId: me?.id ?? null,
      organizationId,
      action: "notification.push.compose",
      entityType: "notification_dispatch_log",
      entityId: null,
      after: {
        dispatchCode: res.dispatchCode,
        notificationType: data.notificationType,
        target: data.target,
      },
      metadata: { organizationId, dispatchCode: res.dispatchCode },
    });

    revalidatePath(COMPOSE_PATH);
    return { ok: true, dispatchCode: res.dispatchCode };
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message : "Failed to send push notification.",
    };
  }
}
