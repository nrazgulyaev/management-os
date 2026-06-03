/**
 * FC-MANAGEMENT-FRONT-OFFICE §agents — pure rules for the front-office watch
 * agents. Kept dependency-free so they're unit-testable and shared by the live
 * Watch panel + the nightly cron.
 */

export type VisaSeverity = "ok" | "expires_during_stay" | "expired";

/**
 * visa-watcher rule: compare an ID/visa expiry to the guest's checkout.
 * - `expired`              — document already expired as of `now`.
 * - `expires_during_stay`  — valid now but lapses before checkout.
 * - `ok`                   — no expiry on file, or valid through checkout.
 */
export function visaSeverity(
  expiresAt: string | null | undefined,
  checkOut: string | null | undefined,
  now: Date,
): VisaSeverity {
  if (!expiresAt) return "ok";
  const exp = Date.parse(expiresAt);
  if (Number.isNaN(exp)) return "ok";
  if (exp < now.getTime()) return "expired";
  if (checkOut) {
    const co = Date.parse(checkOut);
    if (!Number.isNaN(co) && exp < co) return "expires_during_stay";
  }
  return "ok";
}

export function isVisaRisk(
  expiresAt: string | null | undefined,
  checkOut: string | null | undefined,
  now: Date,
): boolean {
  return visaSeverity(expiresAt, checkOut, now) !== "ok";
}

/**
 * turnover-monitor rule: a known not-ready readiness state for a villa with an
 * arrival is a turnover risk. (Mirrors the check-in readiness gate.)
 */
const NOT_READY: ReadonlySet<string> = new Set([
  "cleaning",
  "dirty",
  "inspection",
  "occupied",
  "out_of_order",
  "maintenance_block",
]);

export function isTurnoverRisk(readinessStatus: string | null | undefined): boolean {
  return NOT_READY.has((readinessStatus ?? "").trim());
}
