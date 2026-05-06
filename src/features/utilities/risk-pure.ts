/**
 * Pure utility-threshold helpers + risk derivation. NO `server-only`
 * import. The DB-aware risk scanner in `src/features/maintenance-
 * intelligence/risk.ts` calls into these.
 *
 * Threshold model:
 *   - balance < critical   → critical
 *   - balance < low        → low
 *   - else                 → ok
 * Negative balances are treated as critical regardless of threshold.
 */

export type UtilityRiskLevel = "ok" | "low" | "critical";

export interface UtilityThresholds {
  lowBalanceThresholdMinor: number | null;
  criticalBalanceThresholdMinor: number | null;
}

export function classifyUtilityBalance(
  balanceMinor: number | null | undefined,
  t: UtilityThresholds,
): UtilityRiskLevel {
  if (balanceMinor == null) return "ok";
  if (balanceMinor < 0) return "critical";
  if (
    t.criticalBalanceThresholdMinor != null &&
    balanceMinor < t.criticalBalanceThresholdMinor
  )
    return "critical";
  if (
    t.lowBalanceThresholdMinor != null &&
    balanceMinor < t.lowBalanceThresholdMinor
  )
    return "low";
  return "ok";
}

/**
 * Pure: an account is "missing a recent reading" when there is no
 * reading whose `reading_at` is within `staleAfterDays`. Returns the
 * derived risk level (`low` after threshold, `critical` after 2×).
 */
export function classifyReadingFreshness(input: {
  lastReadingAt: Date | string | null | undefined;
  now?: Date;
  staleAfterDays: number;
}): UtilityRiskLevel {
  const now = input.now ?? new Date();
  if (!input.lastReadingAt) return "low";
  const last = new Date(input.lastReadingAt);
  const ageDays =
    (now.getTime() - last.getTime()) / (24 * 60 * 60 * 1000);
  if (ageDays >= input.staleAfterDays * 2) return "critical";
  if (ageDays >= input.staleAfterDays) return "low";
  return "ok";
}

/**
 * Pure: convert a UtilityRiskLevel to the wider risk severity used by
 * `maintenance_risk_events.severity`.
 */
export function levelToSeverity(level: UtilityRiskLevel): "low" | "medium" | "high" | "critical" {
  if (level === "critical") return "critical";
  if (level === "low") return "high"; // surface low-balance with high severity (action needed soon)
  return "low";
}

/**
 * Pure: pick the right risk_type for a balance level. Returns null
 * when balance is ok (no risk row needed).
 */
export function balanceLevelToRiskType(
  level: UtilityRiskLevel,
): "utility_low_balance" | "utility_critical_balance" | null {
  if (level === "critical") return "utility_critical_balance";
  if (level === "low") return "utility_low_balance";
  return null;
}

/**
 * Pure: format a minor-units amount into a human label, e.g.
 * `12345 IDR → "Rp 123.45"` (no thousand separators, two decimals).
 * The caller decides display formatting; this is a tiny default.
 */
export function formatBalanceLabel(
  balanceMinor: number | null | undefined,
  currency: string | null | undefined,
): string {
  if (balanceMinor == null) return "—";
  const sign = balanceMinor < 0 ? "-" : "";
  const n = Math.abs(balanceMinor);
  const major = Math.floor(n / 100);
  const minor = n % 100;
  return `${sign}${major}.${minor.toString().padStart(2, "0")} ${currency ?? ""}`.trim();
}
