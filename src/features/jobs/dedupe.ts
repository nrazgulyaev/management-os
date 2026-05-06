/**
 * Pure helpers for notification dedupe keys. Extracted so tests can import
 * without dragging in `server-only`-marked job runner code.
 */

const LOW_STOCK_TEMPLATE = "low_stock_alert";

/**
 * Format: low_stock_alert:<role>:YYYY-MM-DD. One open notification per role
 * per UTC day.
 */
export function lowStockDedupeKey(roleKey: string, now: Date = new Date()): string {
  const ymd = now.toISOString().slice(0, 10);
  return `${LOW_STOCK_TEMPLATE}:${roleKey}:${ymd}`;
}

export const LOW_STOCK_TEMPLATE_KEY = LOW_STOCK_TEMPLATE;
