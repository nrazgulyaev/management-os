"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb, rowsOf } from "@/lib/db/client";
import { ownerNotificationPrefs } from "@/lib/db/schema/owner-notification-prefs";
import { requireOwnerWrite } from "@/features/owner-portal/require-owner-write";
import { getOwnerOrgId } from "@/features/owner-portal/owner-context";
import { recordAuditEvent } from "@/features/audit/services";
import {
  DEFAULT_NOTIFICATION_PREFS,
  type OwnerActionState,
  type OwnerNotificationPrefsView,
} from "@/features/owner-portal/notification-prefs-types";

/**
 * Owner notification preferences — read + update against the REAL 6
 * columns of owner_notification_prefs (0114). (The older get-settings.ts
 * exposes a different, partly-fictional 6-toggle UI interface that only
 * maps 3 columns — this module is the faithful one and is what
 * /owner/preferences uses.)
 *
 * "use server" → this file may only export async functions; the View
 * type + defaults live in notification-prefs-types.ts (client-safe).
 */

export async function getOwnerNotificationPrefs(
  ownerId: string,
): Promise<OwnerNotificationPrefsView> {
  const db = getDb();
  if (!db) return DEFAULT_NOTIFICATION_PREFS;
  const rows = rowsOf<{
    statement_ready: boolean;
    maintenance_updates: boolean;
    q_review_reminder: boolean;
    arrival_alerts: boolean;
    marketing_updates: boolean;
    tax_doc_ready: boolean;
  }>(
    await db
      .select({
        statement_ready: ownerNotificationPrefs.statementReady,
        maintenance_updates: ownerNotificationPrefs.maintenanceUpdates,
        q_review_reminder: ownerNotificationPrefs.qReviewReminder,
        arrival_alerts: ownerNotificationPrefs.arrivalAlerts,
        marketing_updates: ownerNotificationPrefs.marketingUpdates,
        tax_doc_ready: ownerNotificationPrefs.taxDocReady,
      })
      .from(ownerNotificationPrefs)
      .where(eq(ownerNotificationPrefs.ownerId, ownerId))
      .limit(1),
  );
  const r = rows[0];
  if (!r) return DEFAULT_NOTIFICATION_PREFS;
  return {
    statementReady: r.statement_ready,
    maintenanceUpdates: r.maintenance_updates,
    qReviewReminder: r.q_review_reminder,
    arrivalAlerts: r.arrival_alerts,
    marketingUpdates: r.marketing_updates,
    taxDocReady: r.tax_doc_ready,
  };
}

const prefsSchema = z.object({
  statementReady: z.boolean(),
  maintenanceUpdates: z.boolean(),
  qReviewReminder: z.boolean(),
  arrivalAlerts: z.boolean(),
  marketingUpdates: z.boolean(),
  taxDocReady: z.boolean(),
});

export async function updateOwnerNotificationPrefsAction(
  _prev: OwnerActionState | null,
  formData: FormData,
): Promise<OwnerActionState> {
  // Owner-scoped write; impersonating super-admins are read-only.
  const auth = await requireOwnerWrite();
  if (!auth.ok) return { ok: false, error: auth.error };

  const db = getDb();
  if (!db) return { ok: false, error: "Database is not configured." };

  const parsed = prefsSchema.safeParse({
    statementReady: formData.get("statementReady") === "on",
    maintenanceUpdates: formData.get("maintenanceUpdates") === "on",
    qReviewReminder: formData.get("qReviewReminder") === "on",
    arrivalAlerts: formData.get("arrivalAlerts") === "on",
    marketingUpdates: formData.get("marketingUpdates") === "on",
    taxDocReady: formData.get("taxDocReady") === "on",
  });
  if (!parsed.success) return { ok: false, error: "Invalid preferences." };
  const data = parsed.data;

  // Upsert keyed on the unique (owner_id) constraint.
  const existing = await db
    .select({ id: ownerNotificationPrefs.id })
    .from(ownerNotificationPrefs)
    .where(eq(ownerNotificationPrefs.ownerId, auth.ownerId))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(ownerNotificationPrefs)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(ownerNotificationPrefs.ownerId, auth.ownerId));
  } else {
    // Org anchor (TENANCY 0158) — owner → ownership_shares → project.org.
    const organizationId = await getOwnerOrgId(auth.ownerId);
    if (!organizationId) {
      return { ok: false, error: "Could not resolve your organisation." };
    }
    await db
      .insert(ownerNotificationPrefs)
      .values({ organizationId, ownerId: auth.ownerId, ...data });
  }

  await recordAuditEvent({
    actorUserId: auth.appUserId,
    action: "owner.notification_prefs.update",
    entityType: "owner",
    entityId: auth.ownerId,
    after: data,
  });

  revalidatePath("/owner/preferences");
  return { ok: true };
}
