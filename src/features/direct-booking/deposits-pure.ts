/**
 * Pure helpers for direct-booking deposits. No DB / no `server-only`
 * import.
 *
 * The deposit row is the gate that sits between an approved request
 * and a confirmed booking. Pure helpers cover:
 *   - amount calculation (percent / fixed / full / minimum / cap)
 *   - status predicates (payable / allows-conversion)
 *   - public label collapse (no internal status leak)
 *   - sanitisation of provider payloads before public exposure
 *   - deposit-code generation
 */

export type DepositStatus =
  | "draft"
  | "pending"
  | "requires_action"
  | "paid"
  | "failed"
  | "expired"
  | "cancelled"
  | "refunded"
  | "manually_marked_paid";

export type DepositPolicyKind = "percent" | "fixed" | "full";

export interface DepositPolicy {
  kind: DepositPolicyKind;
  /** Used when kind = 'percent'. Decimal fraction: 0.30 = 30%. */
  percent?: number;
  /** Used when kind = 'fixed'. Minor units. */
  fixedMinor?: bigint | number;
  /** Optional floor — never charge below this. */
  minimumMinor?: bigint | number;
  /** Optional ceiling — never charge above this. */
  maximumMinor?: bigint | number;
  currency?: string;
}

/** Default platform policy: 30% of total, $300 minimum, capped at total. */
export const DEFAULT_DEPOSIT_POLICY: DepositPolicy = {
  kind: "percent",
  percent: 0.3,
  minimumMinor: 30000n,
  // No max — caller clamps to total.
};

function asBigint(v: bigint | number | string | null | undefined): bigint {
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
 * Pure: compute the deposit amount in minor units.
 *
 * Rules:
 *   - `percent`: `total * percent`, then clamp to `[minimum, maximum]`,
 *     then clamp to `[0, total]` (never charge more than the total).
 *   - `fixed`: use `fixedMinor` directly, then clamp to `[0, total]`.
 *   - `full`: equal to `total`.
 *
 * Inputs that are null / NaN / negative coerce to 0n. The result is
 * always non-negative and never exceeds the total.
 */
export function calculateDepositAmount(
  totalMinor: bigint | number | string,
  policy: DepositPolicy = DEFAULT_DEPOSIT_POLICY,
): bigint {
  const total = asBigint(totalMinor);
  if (total <= 0n) return 0n;

  let amount: bigint;
  switch (policy.kind) {
    case "percent": {
      const pct = policy.percent ?? 0;
      if (!Number.isFinite(pct) || pct <= 0) {
        amount = 0n;
      } else {
        // Scale by 1e6 to keep math integer-pure.
        const scaled = BigInt(Math.round(pct * 1_000_000));
        amount = (total * scaled) / 1_000_000n;
      }
      break;
    }
    case "fixed":
      amount = asBigint(policy.fixedMinor ?? 0);
      break;
    case "full":
      amount = total;
      break;
  }

  const minimum = policy.minimumMinor != null ? asBigint(policy.minimumMinor) : null;
  const maximum = policy.maximumMinor != null ? asBigint(policy.maximumMinor) : null;
  if (minimum != null && amount < minimum) amount = minimum;
  if (maximum != null && amount > maximum) amount = maximum;
  if (amount < 0n) amount = 0n;
  if (amount > total) amount = total;
  return amount;
}

/** Pure: a deposit is payable while in any pre-paid state. */
export function depositIsPayable(status: DepositStatus): boolean {
  return (
    status === "draft" ||
    status === "pending" ||
    status === "requires_action"
  );
}

/**
 * Pure: a booking can be created from this deposit only when the deposit
 * is `paid` (provider) or `manually_marked_paid` (admin override).
 */
export function depositAllowsBookingConversion(
  status: DepositStatus,
): boolean {
  return status === "paid" || status === "manually_marked_paid";
}

/** Pure: friendly deposit code, e.g. `DEP-20260601-0001`. */
export function buildDepositCode(date: string, counter: number): string {
  const datePart = date.replaceAll("-", "");
  const seq = String(Math.max(1, counter)).padStart(4, "0");
  return `DEP-${datePart}-${seq}`;
}

/** Pure: collapse internal status to a guest-friendly label. */
export function publicDepositStatusLabel(status: DepositStatus): {
  label: string;
  tone: "info" | "success" | "warning" | "neutral" | "danger";
} {
  switch (status) {
    case "draft":
    case "pending":
    case "requires_action":
      return { label: "Awaiting payment", tone: "info" };
    case "paid":
    case "manually_marked_paid":
      return { label: "Payment confirmed", tone: "success" };
    case "failed":
      return { label: "Payment failed", tone: "danger" };
    case "expired":
      return { label: "Payment window expired", tone: "warning" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "refunded":
      return { label: "Refunded", tone: "neutral" };
  }
}

/** Pure: admin label retains internal detail. */
export function adminDepositStatusLabel(status: DepositStatus): {
  label: string;
  tone: "info" | "success" | "warning" | "neutral" | "danger";
} {
  switch (status) {
    case "draft":
      return { label: "Draft", tone: "neutral" };
    case "pending":
      return { label: "Pending", tone: "info" };
    case "requires_action":
      return { label: "Requires action", tone: "warning" };
    case "paid":
      return { label: "Paid", tone: "success" };
    case "manually_marked_paid":
      return { label: "Manually marked paid", tone: "success" };
    case "failed":
      return { label: "Failed", tone: "danger" };
    case "expired":
      return { label: "Expired", tone: "warning" };
    case "cancelled":
      return { label: "Cancelled", tone: "neutral" };
    case "refunded":
      return { label: "Refunded", tone: "neutral" };
  }
}

/**
 * Pure: drop fields that should never reach guests / public payloads.
 *
 * Forbidden keys: anything matching `secret | private | key | token |
 * card | cvv | ccv | iban | account` (case-insensitive). The
 * sanitiser is conservative — when in doubt, strip.
 */
const FORBIDDEN_KEY_TOKENS = [
  "secret",
  "private",
  "key",
  "token",
  "card",
  "cvv",
  "ccv",
  "iban",
  "account_number",
  "accountnumber",
  "client_id",
  "clientid",
  "webhook_secret",
];

export function sanitizeProviderPayloadForPublic(
  payload: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  if (!payload) return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(payload)) {
    const lower = k.toLowerCase();
    if (FORBIDDEN_KEY_TOKENS.some((t) => lower.includes(t))) continue;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      out[k] = sanitizeProviderPayloadForPublic(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}
