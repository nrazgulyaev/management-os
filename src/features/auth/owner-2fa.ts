/**
 * Phase 2.3 owner-07 — Owner 2FA helpers.
 *
 * Gate for sensitive owner changes (payout method, account reveal).
 * Two-step flow:
 *   1. requestCode(ownerId, channel)  → sends SMS / email
 *   2. verifyCode(ownerId, code)      → returns short-lived token
 *
 * The token is consumed by the action server fn (e.g. updatePayout)
 * which checks it against the audit log + clears it.
 *
 * Today these helpers return stubbed values; the data PR wires
 * an OTP table + Twilio + email sender.
 */

import "server-only";

export type TwoFAChannel = "sms" | "email";

export interface RequestCodeResult {
  challengeId: string;
  expiresAt: string;
  channel: TwoFAChannel;
  /** Last 4 of the SMS-target / email-target for UI display. */
  hint: string;
}

export interface VerifyCodeResult {
  ok: boolean;
  /** Token to pass into the privileged action. 5 min TTL. */
  token?: string;
  reason?: "expired" | "wrong-code" | "rate-limited";
}

export async function requestTwoFACode(ownerId: string, channel: TwoFAChannel): Promise<RequestCodeResult> {
  void ownerId;
  return {
    challengeId: "stub-challenge",
    expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
    channel,
    hint: channel === "sms" ? "••84" : "••@arconique.com",
  };
}

export async function verifyTwoFACode(challengeId: string, code: string): Promise<VerifyCodeResult> {
  void challengeId;
  if (!code) return { ok: false, reason: "wrong-code" };
  return { ok: false, reason: "wrong-code" };
}

/**
 * Consumes a verification token. The privileged action calls this
 * before applying the change; returns true on success and clears
 * the token so it cannot be reused.
 */
export async function consumeTwoFAToken(token: string): Promise<boolean> {
  void token;
  return false;
}
