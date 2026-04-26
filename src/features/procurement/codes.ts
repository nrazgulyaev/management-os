/**
 * Procurement codes — same shape as inventory: PREFIX-YYYYMMDD-NNNN.
 */

export const PR_CODE_PREFIX = "PR";
export const PO_CODE_PREFIX = "PO";

function ymd(now: Date): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  return `${y}${m}${d}`;
}

function pad4(n: number): string {
  return String(n).padStart(4, "0");
}

export function buildProcurementCode(
  prefix: string,
  counter: number,
  now: Date = new Date(),
): string {
  return `${prefix}-${ymd(now)}-${pad4(counter)}`;
}

export const buildPurchaseRequestCode = (counter: number, now?: Date) =>
  buildProcurementCode(PR_CODE_PREFIX, counter, now);
export const buildPurchaseOrderCode = (counter: number, now?: Date) =>
  buildProcurementCode(PO_CODE_PREFIX, counter, now);
