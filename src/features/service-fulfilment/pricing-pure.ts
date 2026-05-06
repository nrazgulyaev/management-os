/**
 * Pure helpers for fulfilment pricing + finance bridge math.
 * No DB / no `server-only` import.
 *
 * Money is BIGINT minor units throughout — all helpers normalise
 * `null/undefined` inputs to `0n`. Negative values are clamped at
 * the seam to keep the finance bridge sane (refund flows ride the
 * `reverseFinanceBridge` action, not negative inserts).
 */
import type { FulfilmentStatus } from "./status-pure";

export function asBigint(
  v: bigint | number | string | null | undefined,
): bigint {
  if (v == null) return 0n;
  if (typeof v === "bigint") return v;
  if (typeof v === "number") {
    if (!Number.isFinite(v)) return 0n;
    return BigInt(Math.trunc(v));
  }
  try {
    return BigInt(v);
  } catch {
    return 0n;
  }
}

/**
 * Pure: margin = guest_price - internal_cost.
 * Returns the value as bigint minor units. Never throws; nulls become
 * zero. The result CAN be negative (loss-leading service) — the
 * caller chooses whether to clamp.
 */
export function calculateServiceMargin(
  guestPriceMinor: bigint | number | null | undefined,
  internalCostMinor: bigint | number | null | undefined,
): bigint {
  return asBigint(guestPriceMinor) - asBigint(internalCostMinor);
}

/**
 * Pure: pick the internal cost we should report. The default cascade:
 *   1. vendor quote (if a vendor has accepted with a number)
 *   2. vendor's preferred default cost (from service_vendor_services)
 *   3. order's internal cost (the catalog default)
 *
 * Returns 0n when none of the above are present so the bridge can
 * still emit a "skipped_no_amount" outcome.
 */
export function deriveInternalCost(args: {
  vendorQuoteMinor?: bigint | number | null;
  defaultVendorCostMinor?: bigint | number | null;
  orderCostMinor?: bigint | number | null;
}): bigint {
  if (args.vendorQuoteMinor != null) return asBigint(args.vendorQuoteMinor);
  if (args.defaultVendorCostMinor != null)
    return asBigint(args.defaultVendorCostMinor);
  if (args.orderCostMinor != null) return asBigint(args.orderCostMinor);
  return 0n;
}

/**
 * Pure: bridge eligibility. Only completed fulfilments hit finance —
 * cancellations / failures / no-shows must use the explicit
 * reverseFinanceBridge flow if there's anything to reverse.
 */
export function shouldBridgeFinance(status: FulfilmentStatus): boolean {
  return status === "completed";
}

/**
 * Pure: assemble the bridge inputs. Returns the revenue + expense
 * legs for the bookkeeping action. Both legs CAN be zero — that
 * triggers the `skipped_no_amount` branch.
 */
export function calculateFinanceBridgeAmounts(args: {
  guestPriceMinor: bigint | number | null | undefined;
  internalCostMinor: bigint | number | null | undefined;
}): {
  revenueMinor: bigint;
  expenseMinor: bigint;
  marginMinor: bigint;
  hasAmount: boolean;
} {
  const revenue = clampNonNegative(asBigint(args.guestPriceMinor));
  const expense = clampNonNegative(asBigint(args.internalCostMinor));
  const margin = revenue - expense;
  return {
    revenueMinor: revenue,
    expenseMinor: expense,
    marginMinor: margin,
    hasAmount: revenue > 0n || expense > 0n,
  };
}

function clampNonNegative(v: bigint): bigint {
  return v < 0n ? 0n : v;
}

/**
 * Pure: format an amount for the admin UI in major units.
 * 1 250 000 minor / USD → "1,250,000.00 USD".
 */
export function formatFulfilmentAmountForAdmin(
  amountMinor: bigint | number | null | undefined,
  currency: string | null | undefined,
  opts?: { fractionDigits?: number },
): string {
  const v = asBigint(amountMinor);
  const fraction = opts?.fractionDigits ?? 2;
  const divisor = 10n ** BigInt(fraction);
  const major = v / divisor;
  const minor = v % divisor;
  const minorStr = String(minor < 0n ? -minor : minor).padStart(fraction, "0");
  const sign = v < 0n ? "-" : "";
  const majorStr = formatGrouped(major < 0n ? -major : major);
  return `${sign}${majorStr}${fraction > 0 ? "." + minorStr : ""} ${
    currency ?? "USD"
  }`;
}

function formatGrouped(n: bigint): string {
  const s = n.toString();
  if (s.length <= 3) return s;
  let out = "";
  for (let i = s.length; i > 0; i -= 3) {
    const start = Math.max(0, i - 3);
    out = s.slice(start, i) + (out ? "," + out : "");
  }
  return out;
}
