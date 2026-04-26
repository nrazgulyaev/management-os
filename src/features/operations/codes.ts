/**
 * Deterministic readable codes for operations entities.
 *
 * Format: PREFIX-YYYYMMDD-NNNN where NNNN is a 4-digit zero-padded counter
 * for that day. The counter must be supplied by the caller (typically a
 * COUNT(*)+1 against the same prefix on the same day).
 *
 * If the caller cannot determine a counter, a 4-character random suffix is
 * acceptable — both shapes match the regex below.
 */

export const TASK_CODE_PREFIX = "OPS";
export const MAINTENANCE_CODE_PREFIX = "MNT";
export const SERVICE_REQUEST_CODE_PREFIX = "SR";

const codeShape = /^[A-Z]{2,4}-\d{8}-(?:\d{4}|[A-Z0-9]{4})$/;

export function isOperationsCode(s: string): boolean {
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

export function buildOpsCode(prefix: string, dayCounter: number, now: Date = new Date()): string {
  return `${prefix}-${ymd(now)}-${pad4(dayCounter)}`;
}

const RANDOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomSuffix(len = 4): string {
  let out = "";
  for (let i = 0; i < len; i++) {
    out += RANDOM_ALPHABET.charAt(Math.floor(Math.random() * RANDOM_ALPHABET.length));
  }
  return out;
}

/**
 * Fallback for callers that don't have a deterministic counter handy. The
 * random tail keeps codes unique without a DB round-trip.
 */
export function buildOpsCodeRandom(prefix: string, now: Date = new Date()): string {
  return `${prefix}-${ymd(now)}-${randomSuffix(4)}`;
}

export const buildTaskCode = (counter: number, now?: Date) =>
  buildOpsCode(TASK_CODE_PREFIX, counter, now);

export const buildMaintenanceCode = (counter: number, now?: Date) =>
  buildOpsCode(MAINTENANCE_CODE_PREFIX, counter, now);

export const buildServiceRequestCode = (counter: number, now?: Date) =>
  buildOpsCode(SERVICE_REQUEST_CODE_PREFIX, counter, now);
