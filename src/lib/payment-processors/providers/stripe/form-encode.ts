/**
 * Stage 6.P3.F — Stripe-style form encoding.
 *
 * Stripe accepts deeply nested objects via bracket-style form keys:
 *   { metadata: { order_id: "42" } }
 *     → "metadata[order_id]=42"
 *   { line_items: [{ price_data: { currency: "usd" } }] }
 *     → "line_items[0][price_data][currency]=usd"
 *
 * The Stripe SDK does this internally; we hand-roll the same shape so
 * we don't have to add the SDK as a dependency.
 *
 * Pure function — no I/O. Importable from anywhere.
 */

export function stripeFormEncode(
  obj: Record<string, unknown>,
): string {
  const pairs: string[] = [];
  walk(obj, "", pairs);
  return pairs.join("&");
}

function walk(value: unknown, prefix: string, out: string[]): void {
  if (value === null || value === undefined) {
    // Stripe ignores null/undefined; skip rather than emit empty
    // strings (which Stripe interprets as "set field to empty
    // string", a destructive update).
    return;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      // Empty array: Stripe expects an empty-string value at the bare
      // prefix to clear list fields.
      out.push(`${encodeURIComponent(prefix)}=`);
      return;
    }
    value.forEach((v, i) => {
      walk(v, prefix ? `${prefix}[${i}]` : String(i), out);
    });
    return;
  }
  if (typeof value === "object" && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const next = prefix ? `${prefix}[${k}]` : k;
      walk(v, next, out);
    }
    return;
  }
  // Scalar (string, number, boolean, Date).
  let str: string;
  if (value instanceof Date) {
    // Stripe accepts unix-seconds.
    str = String(Math.floor(value.getTime() / 1000));
  } else if (typeof value === "boolean") {
    str = value ? "true" : "false";
  } else if (typeof value === "bigint") {
    str = value.toString();
  } else {
    str = String(value);
  }
  out.push(`${encodeURIComponent(prefix)}=${encodeURIComponent(str)}`);
}
