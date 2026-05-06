/**
 * V9E stub smart-lock helpers. Pure — no DB, no network, no real lock
 * APIs. The display code is a deterministic 6-digit number derived from
 * (booking_id, villa_id) so demo flows are reproducible while the value
 * looks unguessable to a human reading the page.
 *
 * IMPORTANT: do NOT use this for real access control. It is a placeholder
 * for v9F+ provider integrations.
 */

import { createHash } from "node:crypto";

/** Pure: a 6-digit display-only stub code. */
export function deriveStubLockCode(bookingId: string, villaId: string): string {
  const digest = createHash("sha256")
    .update(`stub-lock:${bookingId}:${villaId}`, "utf8")
    .digest();
  // Convert the first 4 bytes to an unsigned 32-bit int and modulo to
  // 6 digits. Padded with leading zeros for consistency.
  const n = digest.readUInt32BE(0) % 1_000_000;
  return n.toString().padStart(6, "0");
}

/**
 * Pure: validity window. The stub is visible to the guest portal from
 * `checkInDate − 24h` until `checkOutDate + 3h`.
 */
export function deriveStubLockWindow(
  checkInDate: string,
  checkOutDate: string,
): { validFrom: Date; validUntil: Date } {
  const checkInMidnightUtc = new Date(`${checkInDate}T00:00:00.000Z`);
  const checkOutMidnightUtc = new Date(`${checkOutDate}T00:00:00.000Z`);
  return {
    validFrom: new Date(checkInMidnightUtc.getTime() - 24 * 60 * 60 * 1000),
    validUntil: new Date(checkOutMidnightUtc.getTime() + 3 * 60 * 60 * 1000),
  };
}

/**
 * Pure: should the stub be visible *right now*? Active status + within
 * the validity window. Operators can revoke ahead of time by flipping
 * status to 'revoked'.
 */
export function isStubLockVisible(input: {
  status: string;
  validFrom: Date | string;
  validUntil: Date | string;
  now?: Date;
}): boolean {
  if (input.status !== "active") return false;
  const now = (input.now ?? new Date()).getTime();
  const from = +new Date(input.validFrom);
  const until = +new Date(input.validUntil);
  return now >= from && now < until;
}
