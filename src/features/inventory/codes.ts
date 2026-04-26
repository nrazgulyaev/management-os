/**
 * Codes for inventory + procurement entities. Same shape as the operations
 * codes from v4: PREFIX-YYYYMMDD-NNNN.
 */

const codeShape = /^[A-Z]{2,4}-\d{8}-(?:\d{4}|[A-Z0-9]{4})$/;

export const MOVEMENT_CODE_PREFIX = "MV";
export const COUNT_CODE_PREFIX = "CNT";

export function isInventoryCode(s: string): boolean {
  return codeShape.test(s);
}

function ymd(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export function buildInventoryCode(
  prefix: string,
  counter: number,
  now: Date = new Date(),
): string {
  return `${prefix}-${ymd(now)}-${pad4(counter)}`;
}

export const buildMovementCode = (counter: number, now?: Date) =>
  buildInventoryCode(MOVEMENT_CODE_PREFIX, counter, now);

export const buildCountCode = (counter: number, now?: Date) =>
  buildInventoryCode(COUNT_CODE_PREFIX, counter, now);
