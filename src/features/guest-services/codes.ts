/**
 * V9F — guest service order code mint. Format: `GSO-YYYYMMDD-NNNN` where
 * `NNNN` is the daily counter. Pure: tests pass in a fixed `now` and a
 * counter from `nextDailyCounter("GSO")`.
 */

export const GUEST_SERVICE_ORDER_CODE_PREFIX = "GSO";

const codeShape = /^GSO-\d{8}-\d{4}$/;

export function isGuestServiceOrderCode(s: string): boolean {
  return codeShape.test(s);
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

function ymd(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

export function buildGuestServiceOrderCode(
  counter: number,
  now: Date = new Date(),
): string {
  return `${GUEST_SERVICE_ORDER_CODE_PREFIX}-${ymd(now)}-${pad4(counter)}`;
}
