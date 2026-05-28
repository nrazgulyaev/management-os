/**
 * Phase 2.3 owner-07 / Phase 2 data-wiring PR 3 — getOwnerSettings.
 *
 * Returns the 5 sections of /owner/settings. Wires:
 *   profile        → `owners` row
 *   payout         → `payout_methods` (most recent active, masked)
 *   notifications  → `owner_notification_prefs` (3 fields cleanly
 *                    map; the other 3 UI fields don't have a
 *                    direct DB column yet — kept on defaults)
 *
 * Security (2FA + sessions) is auth-system-level state, not owned
 * by this fn — left at defaults until the auth surfaces an API.
 * Termination is policy state — defaults to true.
 */

import "server-only";
import { desc, eq } from "drizzle-orm";
import { getDb } from "@/lib/db/client";
import { owners, payoutMethods } from "@/lib/db/schema/ownership";
import { ownerNotificationPrefs } from "@/lib/db/schema/owner-notification-prefs";

export interface OwnerProfile {
  name: string;
  email: string;
  phone: string;
  language: string;
}

export interface OwnerPayoutMasked {
  /** "US••••8842" */
  maskedAccount: string;
  currency: string;
  lastUpdatedLabel?: string;
  bankName?: string;
}

export interface OwnerNotificationPrefs {
  newBookingEmail: boolean;
  statementReadyEmail: boolean;
  payoutSentEmail: boolean;
  arrivalSms: boolean;
  monthlyDigestEmail: boolean;
  marketingEmail: boolean;
}

export interface OwnerSettingsResult {
  profile: OwnerProfile;
  payout: OwnerPayoutMasked;
  notifications: OwnerNotificationPrefs;
  twoFactorEnabled: boolean;
  activeSessions: number;
  canRequestTermination: boolean;
}

const DEFAULT_NOTIFICATIONS: OwnerNotificationPrefs = {
  newBookingEmail: true,
  statementReadyEmail: true,
  payoutSentEmail: true,
  arrivalSms: false,
  monthlyDigestEmail: true,
  marketingEmail: true,
};

const DEFAULT_PROFILE: OwnerProfile = {
  name: "—",
  email: "—",
  phone: "—",
  language: "English",
};

const DEFAULT_PAYOUT: OwnerPayoutMasked = {
  maskedAccount: "US••••0000",
  currency: "USD",
  bankName: "—",
};

function maskAccount(methodType: string, last4: string | null, currency: string): string {
  const prefix = methodType === "bank_idr" ? "ID" : methodType === "bank_intl" ? currency : "ID";
  return `${prefix}••••${last4 ?? "0000"}`;
}

export async function getOwnerSettings(ownerId: string): Promise<OwnerSettingsResult> {
  const db = getDb();
  if (!db) {
    return {
      profile: DEFAULT_PROFILE,
      payout: DEFAULT_PAYOUT,
      notifications: DEFAULT_NOTIFICATIONS,
      twoFactorEnabled: false,
      activeSessions: 1,
      canRequestTermination: true,
    };
  }

  const [ownerRow] = await db
    .select({
      displayName: owners.displayName,
      email: owners.email,
      phone: owners.phone,
    })
    .from(owners)
    .where(eq(owners.id, ownerId))
    .limit(1);

  const [payout] = await db
    .select({
      methodType: payoutMethods.methodType,
      currency: payoutMethods.currency,
      accountLabel: payoutMethods.accountLabel,
      bankName: payoutMethods.bankName,
      accountLast4: payoutMethods.accountLast4,
      updatedAt: payoutMethods.updatedAt,
    })
    .from(payoutMethods)
    // Prefer the default-flagged method; fall back to the most recently
    // updated one (handled by orderBy).
    .where(eq(payoutMethods.ownerId, ownerId))
    .orderBy(desc(payoutMethods.isDefault), desc(payoutMethods.updatedAt))
    .limit(1);

  const [prefs] = await db
    .select()
    .from(ownerNotificationPrefs)
    .where(eq(ownerNotificationPrefs.ownerId, ownerId))
    .limit(1);

  // The UI's 6 toggles don't map 1:1 with the DB's 6. Three align cleanly;
  // the other three stay on defaults until the schema or UI converges.
  const notifications: OwnerNotificationPrefs = prefs
    ? {
        ...DEFAULT_NOTIFICATIONS,
        statementReadyEmail: prefs.statementReady,
        arrivalSms: prefs.arrivalAlerts,
        marketingEmail: prefs.marketingUpdates,
      }
    : DEFAULT_NOTIFICATIONS;

  return {
    profile: ownerRow
      ? {
          name: ownerRow.displayName,
          email: ownerRow.email ?? "—",
          phone: ownerRow.phone ?? "—",
          language: "English",
        }
      : DEFAULT_PROFILE,
    payout: payout
      ? {
          maskedAccount: maskAccount(payout.methodType, payout.accountLast4, payout.currency),
          currency: payout.currency,
          bankName: payout.bankName ?? undefined,
          lastUpdatedLabel: payout.updatedAt
            ? new Date(payout.updatedAt).toISOString().slice(0, 10)
            : undefined,
        }
      : DEFAULT_PAYOUT,
    notifications,
    twoFactorEnabled: false,
    activeSessions: 1,
    canRequestTermination: true,
  };
}
