/**
 * Phase 2.3 owner-07 — getOwnerSettings.
 *
 * Server fn behind /owner/settings. Returns the 5 sections:
 *   profile      · name, email, phone, language
 *   payout       · masked account, currency, last-updated
 *   notifications· 6 boolean toggles
 *   security     · 2FA on/off, sessions count
 *   termination  · whether the owner can request the call
 *
 * Account number is masked here — reveal goes through the
 * `revealAccountNumber()` server action with audit logging.
 *
 * Today returns sensible defaults; the data PR wires owner_profile
 * + owner_notification_prefs reads.
 */

import "server-only";

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

export async function getOwnerSettings(ownerId: string): Promise<OwnerSettingsResult> {
  void ownerId;
  return {
    profile: {
      name: "—",
      email: "—",
      phone: "—",
      language: "English",
    },
    payout: {
      maskedAccount: "US••••0000",
      currency: "USD",
      bankName: "—",
    },
    notifications: DEFAULT_NOTIFICATIONS,
    twoFactorEnabled: false,
    activeSessions: 1,
    canRequestTermination: true,
  };
}
