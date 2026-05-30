/**
 * Pure types + defaults for owner notification prefs. Split out of
 * notification-prefs.ts because that file is "use server" (can only
 * export async functions). Safe to import from client components.
 */

export interface OwnerNotificationPrefsView {
  statementReady: boolean;
  maintenanceUpdates: boolean;
  qReviewReminder: boolean;
  arrivalAlerts: boolean;
  marketingUpdates: boolean;
  taxDocReady: boolean;
}

/** Column defaults from the schema (0114). */
export const DEFAULT_NOTIFICATION_PREFS: OwnerNotificationPrefsView = {
  statementReady: true,
  maintenanceUpdates: true,
  qReviewReminder: true,
  arrivalAlerts: false,
  marketingUpdates: false,
  taxDocReady: true,
};

export type OwnerActionState = { ok: boolean; error?: string };
