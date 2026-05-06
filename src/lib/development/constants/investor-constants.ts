/**
 * Pure constants for the Stage 2.3 investor capital cluster. No server
 * imports — safe to use from client components.
 */

export const INVESTOR_TYPES = [
  "gp",
  "lp_private",
  "lp_institutional",
  "landowner_jv",
] as const;
export type InvestorType = (typeof INVESTOR_TYPES)[number];

export const INVESTOR_TYPE_LABEL: Record<InvestorType, string> = {
  gp: "General partner",
  lp_private: "LP — private",
  lp_institutional: "LP — institutional",
  landowner_jv: "Landowner JV",
};

export const INVESTOR_STATUSES = ["active", "inactive", "exited"] as const;
export type InvestorStatus = (typeof INVESTOR_STATUSES)[number];

export const INVESTOR_STATUS_LABEL: Record<InvestorStatus, string> = {
  active: "Active",
  inactive: "Inactive",
  exited: "Exited",
};

export const SUPPORTED_CURRENCIES = [
  "USD",
  "IDR",
  "RUB",
  "EUR",
  "USDT",
  "CNY",
] as const;
export type SupportedCurrency = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_SYMBOL: Record<SupportedCurrency, string> = {
  USD: "$",
  IDR: "Rp",
  RUB: "₽",
  EUR: "€",
  USDT: "USDT",
  CNY: "¥",
};

export const CURRENCY_LABEL: Record<SupportedCurrency, string> = {
  USD: "USD — US Dollar",
  IDR: "IDR — Indonesian Rupiah",
  RUB: "RUB — Russian Ruble",
  EUR: "EUR — Euro",
  USDT: "USDT — Tether",
  CNY: "CNY — Chinese Yuan",
};

export const REPORTING_LANGUAGES = ["en", "ru", "id", "zh"] as const;
export type ReportingLanguage = (typeof REPORTING_LANGUAGES)[number];

export const REPORTING_LANGUAGE_LABEL: Record<ReportingLanguage, string> = {
  en: "English",
  ru: "Русский",
  id: "Bahasa Indonesia",
  zh: "中文",
};

export const LEGAL_ENTITY_TYPES = [
  "individual",
  "llc",
  "pt_pma",
  "offshore",
  "trust",
] as const;
export type LegalEntityType = (typeof LEGAL_ENTITY_TYPES)[number];

export const LEGAL_ENTITY_LABEL: Record<LegalEntityType, string> = {
  individual: "Individual",
  llc: "LLC",
  pt_pma: "PT PMA (Indonesia)",
  offshore: "Offshore",
  trust: "Trust",
};

// -----------------------------------------------------------------------------
// Commitments
// -----------------------------------------------------------------------------

export const COMMITMENT_STATUSES = [
  "active",
  "fully_called",
  "closed",
  "cancelled",
] as const;
export type CommitmentStatus = (typeof COMMITMENT_STATUSES)[number];

export const COMMITMENT_STATUS_LABEL: Record<CommitmentStatus, string> = {
  active: "Active",
  fully_called: "Fully called",
  closed: "Closed",
  cancelled: "Cancelled",
};

// -----------------------------------------------------------------------------
// Drawdowns
// -----------------------------------------------------------------------------

export const DRAWDOWN_STATUSES = [
  "requested",
  "received",
  "overdue",
  "cancelled",
] as const;
export type DrawdownStatus = (typeof DRAWDOWN_STATUSES)[number];

export const DRAWDOWN_STATUS_LABEL: Record<DrawdownStatus, string> = {
  requested: "Requested",
  received: "Received",
  overdue: "Overdue",
  cancelled: "Cancelled",
};

export const DRAWDOWN_TRIGGER_REASONS = [
  "minimum_balance_threshold",
  "milestone_call",
  "manual",
  "initial_capitalization",
] as const;
export type DrawdownTriggerReason = (typeof DRAWDOWN_TRIGGER_REASONS)[number];

export const DRAWDOWN_TRIGGER_LABEL: Record<DrawdownTriggerReason, string> = {
  minimum_balance_threshold: "Minimum balance threshold",
  milestone_call: "Milestone call",
  manual: "Manual",
  initial_capitalization: "Initial capitalization",
};

export const DRAWDOWN_PAYMENT_METHODS = [
  "bank_wire",
  "crypto",
  "cash",
] as const;
export type DrawdownPaymentMethod = (typeof DRAWDOWN_PAYMENT_METHODS)[number];

// -----------------------------------------------------------------------------
// Wallets
// -----------------------------------------------------------------------------

export const WALLET_TRANSACTION_TYPES = [
  "drawdown_received",
  "capital_return",
  "profit_distribution",
  "wallet_withdrawal",
  "wallet_reinvest_out",
  "wallet_reinvest_in",
  "wallet_hold_set",
  "wallet_hold_release",
  "wallet_take_asset",
  "adjustment",
] as const;
export type WalletTransactionType = (typeof WALLET_TRANSACTION_TYPES)[number];

export const WALLET_TX_TYPE_LABEL: Record<WalletTransactionType, string> = {
  drawdown_received: "Drawdown received",
  capital_return: "Capital return",
  profit_distribution: "Profit distribution",
  wallet_withdrawal: "Wallet withdrawal",
  wallet_reinvest_out: "Reinvest (out)",
  wallet_reinvest_in: "Reinvest (in)",
  wallet_hold_set: "Hold set",
  wallet_hold_release: "Hold released",
  wallet_take_asset: "Asset taken",
  adjustment: "Adjustment",
};

/** Transactions that count as actual cash-out for IRR calculation */
export const WALLET_CASH_OUT_TYPES: ReadonlySet<WalletTransactionType> =
  new Set(["wallet_withdrawal", "wallet_take_asset"]);

/** Transactions that count as cash-in for IRR (drawdowns received from investor) */
export const WALLET_CASH_IN_TYPES: ReadonlySet<WalletTransactionType> = new Set([
  "drawdown_received",
]);

// -----------------------------------------------------------------------------
// Distributions
// -----------------------------------------------------------------------------

export const DISTRIBUTION_TYPES = [
  "capital_return",
  "profit_distribution",
  "mixed",
] as const;
export type DistributionType = (typeof DISTRIBUTION_TYPES)[number];

export const DISTRIBUTION_TYPE_LABEL: Record<DistributionType, string> = {
  capital_return: "Capital return",
  profit_distribution: "Profit distribution",
  mixed: "Mixed",
};

export const DISTRIBUTION_STATUSES = [
  "declared",
  "executing",
  "completed",
  "cancelled",
] as const;
export type DistributionStatus = (typeof DISTRIBUTION_STATUSES)[number];

export const DISTRIBUTION_STATUS_LABEL: Record<DistributionStatus, string> = {
  declared: "Declared",
  executing: "Executing",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const DISTRIBUTION_TRIGGER_REASONS = [
  "self_sustaining_threshold",
  "project_exit",
  "final_distribution",
  "manual",
] as const;
export type DistributionTriggerReason =
  (typeof DISTRIBUTION_TRIGGER_REASONS)[number];

export const DISTRIBUTION_ALLOCATION_STATUSES = [
  "pending",
  "executed",
  "cancelled",
] as const;
export type DistributionAllocationStatus =
  (typeof DISTRIBUTION_ALLOCATION_STATUSES)[number];

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

/**
 * Format a USD-minor BIGINT as a display string. Always 2 decimal places
 * for USD, 0 for IDR/RUB/CNY (no minor units in everyday use), 6 for USDT
 * (crypto convention). Returns the value in the canonical USD column.
 */
export function formatUsdMinor(
  cents: bigint | number | null | undefined,
): string {
  if (cents === null || cents === undefined) return "$0.00";
  const n = typeof cents === "bigint" ? Number(cents) : cents;
  return `$${(n / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function formatCurrencyMinor(
  amount: bigint | number | null | undefined,
  currency: SupportedCurrency,
): string {
  if (amount === null || amount === undefined) {
    return `${CURRENCY_SYMBOL[currency]}0`;
  }
  const n = typeof amount === "bigint" ? Number(amount) : amount;
  const symbol = CURRENCY_SYMBOL[currency];
  // For currencies whose minor unit is universally used (USD, EUR), divide by 100.
  // For IDR/RUB/CNY, divide by 100 as well — we always store in *minor* units
  // for consistency, even though IDR doesn't have widely-used coins.
  // USDT divides by 1_000_000 (6 decimals on-chain convention).
  const divisor = currency === "USDT" ? 1_000_000 : 100;
  const fractionDigits =
    currency === "USDT"
      ? 2
      : currency === "USD" || currency === "EUR"
      ? 2
      : 0;
  return `${symbol}${(n / divisor).toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  })}`;
}
