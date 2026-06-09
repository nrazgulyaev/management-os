// Note: this provider is only imported from server-side modules (the
// delivery worker + selectProvider). We intentionally avoid `import
// "server-only"` here so the pure `selectProvider` in `index.ts` stays
// importable from `node:test`. Runtime safety is preserved because
// `getDb()` already returns null in non-server contexts and `send()`
// short-circuits to "skipped".
import { getDb } from "@/lib/db/client";
import { inAppNotifications } from "@/lib/db/schema/notifications";
import type { NotificationProvider, DeliveryInput } from "./types";

/**
 * Inserts a row into `in_app_notifications` for the resolved app_user (or
 * owner). The worker is responsible for fanning out role-targeted
 * notifications to one recipient per matching app_user before calling here.
 *
 * Always reports `sent` once the row lands. If the DB is missing we fall
 * through to "skipped" so the queue lifecycle still advances.
 */
export const inAppProvider: NotificationProvider = {
  key: "in_app",
  supports: (channel) => channel === "in_app",
  isConfigured: () => true,
  async send(input: DeliveryInput) {
    const db = getDb();
    if (!db) {
      return { status: "skipped", errorMessage: "database unavailable" };
    }

    if (!input.appUserId && !input.ownerId && !input.roleKey) {
      return {
        status: "skipped",
        errorMessage: "in-app provider needs an app user, owner, or role recipient",
      };
    }

    const [row] = await db
      .insert(inAppNotifications)
      .values({
        // TENANCY-FINANCE-DOCS — copy the parent queue row's org.
        organizationId: input.organizationId ?? null,
        notificationId: input.notificationId,
        appUserId: input.appUserId ?? null,
        ownerId: input.ownerId ?? null,
        roleKey: input.roleKey ?? null,
        title: input.title,
        body: input.body,
        payload: (input.payload ?? null) as typeof inAppNotifications.$inferInsert["payload"],
        priority: input.priority,
        status: "unread",
      })
      .returning({ id: inAppNotifications.id });

    return {
      status: "sent",
      providerMessageId: row.id,
      responseJson: { inAppNotificationId: row.id },
    };
  },
};
