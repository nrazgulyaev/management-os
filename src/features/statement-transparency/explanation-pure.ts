/**
 * Prompt 110 — Pure helpers for the owner-facing statement explanation.
 *
 * No DB / no `server-only` import.  These functions consume already-
 * grouped statement data (the output of `buildStatementSourceGroups`)
 * plus the statement totals and produce the owner-safe copy that
 * lands in `statement_explanation_snapshots`.
 *
 * Tone: professional, calm, investor-grade.  Internal IDs and
 * internal vocabulary never appear.
 */

import type {
  StatementSourceGroupAggregate,
  StatementGroupKey,
} from "./grouping-pure";
import { formatMoneyMinor } from "@/lib/money";

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

export interface StatementExplanationInput {
  statement: {
    statementCode: string;
    periodLabel: string;
    currency: string;
    grossRevenueMinor: bigint;
    totalFeesMinor: bigint;
    totalExpensesMinor: bigint;
    totalTaxesMinor: bigint;
    totalReservesMinor: bigint;
    managementFeeMinor: bigint;
    netPayoutMinor: bigint;
    status: string;
  };
  groups: ReadonlyArray<StatementSourceGroupAggregate>;
  warningCounts: {
    info: number;
    warning: number;
    critical: number;
  };
}

export interface StatementExplanationSnapshotShape {
  headline: string;
  summary: string;
  bulletPoints: string[];
  payoutExplanation: string | null;
  revenueExplanation: string | null;
  deductionExplanation: string | null;
  reserveExplanation: string | null;
  warningExplanation: string | null;
  currency: string;
  totalRevenueMinor: bigint;
  totalDeductionsMinor: bigint;
  netPayoutMinor: bigint;
}

// -----------------------------------------------------------------------------
// Friendly status
// -----------------------------------------------------------------------------

export function ownerFriendlyStatementStatus(status: string): string {
  switch ((status ?? "").toLowerCase()) {
    case "draft":
      return "In preparation";
    case "issued":
      return "Issued for your review";
    case "approved":
      return "Approved";
    case "paid":
      return "Paid";
    case "voided":
      return "Voided";
    default:
      return status;
  }
}

// -----------------------------------------------------------------------------
// Top-level builder
// -----------------------------------------------------------------------------

/**
 * Pure: produce the full snapshot shape from grouped data + the
 * statement totals.  Deterministic — same input, same output.
 */
export function buildStatementExplanationSnapshot(
  input: StatementExplanationInput,
): StatementExplanationSnapshotShape {
  const { statement, groups, warningCounts } = input;
  const currency = statement.currency;
  const totalRevenue = sumGroupNet(groups, [
    "direct_booking_revenue",
    "ota_revenue",
    "guest_service_revenue",
    "other",
  ]);
  const totalDeductions = sumGroupNet(groups, [
    "owner_stay_charges",
    "maintenance_charges",
    "utility_charges",
    "inventory_charges",
    "service_fulfilment_costs",
    "management_fees",
    "taxes",
    "reserves",
    "adjustments",
  ]);

  const friendlyStatus = ownerFriendlyStatementStatus(statement.status);
  const headline = `Your ${statement.periodLabel} statement is ${friendlyStatus.toLowerCase()}.`;
  const summary =
    "This statement includes the revenue your villa earned and the charges that reduced your net payout for the period. Every figure is supported by an underlying ledger entry.";

  return {
    headline,
    summary,
    bulletPoints: buildOwnerStatementBulletPoints({
      groups,
      currency,
      netPayoutMinor: statement.netPayoutMinor,
      warningCounts,
    }),
    revenueExplanation: buildRevenueExplanation(groups, currency),
    deductionExplanation: buildDeductionExplanation(groups, currency),
    reserveExplanation: buildReserveExplanation(groups, currency),
    payoutExplanation: buildPayoutExplanation({
      currency,
      netPayoutMinor: statement.netPayoutMinor,
      grossRevenueMinor: statement.grossRevenueMinor,
      totalDeductionsMinor: sumDeductionTotals(statement),
    }),
    warningExplanation: buildWarningExplanation(warningCounts),
    currency,
    totalRevenueMinor: totalRevenue,
    totalDeductionsMinor: totalDeductions,
    netPayoutMinor: statement.netPayoutMinor,
  };
}

// -----------------------------------------------------------------------------
// Section builders
// -----------------------------------------------------------------------------

export function buildRevenueExplanation(
  groups: ReadonlyArray<StatementSourceGroupAggregate>,
  currency: string,
): string | null {
  const direct = findGroup(groups, "direct_booking_revenue");
  const ota = findGroup(groups, "ota_revenue");
  const services = findGroup(groups, "guest_service_revenue");
  const other = findGroup(groups, "other");
  const parts: string[] = [];
  if (direct && direct.grossAmountMinor > 0n) {
    parts.push(
      `Direct bookings contributed ${formatMoneyMinor(direct.grossAmountMinor, currency)} in gross accommodation revenue.`,
    );
  }
  if (ota && ota.grossAmountMinor > 0n) {
    parts.push(
      `OTA / platform bookings contributed ${formatMoneyMinor(ota.grossAmountMinor, currency)} before platform-related deductions.`,
    );
  }
  if (services && services.grossAmountMinor > 0n) {
    parts.push(
      `Guest services and upsells added ${formatMoneyMinor(services.grossAmountMinor, currency)} in additional revenue.`,
    );
  }
  if (other && other.grossAmountMinor > 0n) {
    parts.push(
      `Other revenue added ${formatMoneyMinor(other.grossAmountMinor, currency)}.`,
    );
  }
  if (parts.length === 0) return null;
  return parts.join(" ");
}

export function buildDeductionExplanation(
  groups: ReadonlyArray<StatementSourceGroupAggregate>,
  currency: string,
): string | null {
  const buckets: Array<{ key: StatementGroupKey; verb: string }> = [
    { key: "owner_stay_charges", verb: "Owner stay charges" },
    { key: "service_fulfilment_costs", verb: "Service fulfilment costs" },
    { key: "maintenance_charges", verb: "Maintenance" },
    { key: "utility_charges", verb: "Utilities" },
    { key: "inventory_charges", verb: "Inventory & supplies" },
    { key: "management_fees", verb: "Management fees" },
    { key: "taxes", verb: "Taxes & platform fees" },
  ];
  const parts: string[] = [];
  for (const b of buckets) {
    const g = findGroup(groups, b.key);
    if (g && g.deductionAmountMinor > 0n) {
      parts.push(
        `${b.verb}: ${formatMoneyMinor(g.deductionAmountMinor, currency)}.`,
      );
    }
  }
  if (parts.length === 0) return null;
  return parts.join(" ");
}

export function buildReserveExplanation(
  groups: ReadonlyArray<StatementSourceGroupAggregate>,
  currency: string,
): string | null {
  const reserves = findGroup(groups, "reserves");
  if (!reserves) return null;
  const additions = reserves.deductionAmountMinor;
  const releases = reserves.grossAmountMinor;
  if (additions === 0n && releases === 0n) return null;
  const parts: string[] = [];
  if (additions > 0n) {
    parts.push(
      `${formatMoneyMinor(additions, currency)} was added to your reserve balance for upcoming maintenance and contingency cover.`,
    );
  }
  if (releases > 0n) {
    parts.push(
      `${formatMoneyMinor(releases, currency)} was released from your reserve balance during the period.`,
    );
  }
  return parts.join(" ");
}

export function buildPayoutExplanation(input: {
  currency: string;
  netPayoutMinor: bigint;
  grossRevenueMinor: bigint;
  totalDeductionsMinor: bigint;
}): string {
  const { currency, netPayoutMinor, grossRevenueMinor, totalDeductionsMinor } =
    input;
  if (netPayoutMinor < 0n) {
    return `This period closed with a deficit of ${formatMoneyMinor(-netPayoutMinor, currency)}. Charges exceeded revenue for the period; the deficit will roll into your next statement unless settled separately. Please review the deductions section before approving.`;
  }
  if (netPayoutMinor === 0n) {
    return "There is no net payout this period. Revenue and deductions balanced out.";
  }
  return `Your expected net payout for this statement is ${formatMoneyMinor(netPayoutMinor, currency)} — derived from ${formatMoneyMinor(grossRevenueMinor, currency)} of gross revenue minus ${formatMoneyMinor(totalDeductionsMinor, currency)} of charges, fees, taxes, and reserve movements.`;
}

export function buildWarningExplanation(input: {
  info: number;
  warning: number;
  critical: number;
}): string | null {
  const total = input.warning + input.critical;
  if (total === 0) return null;
  if (input.critical > 0) {
    return "Some finance items need operator review before this statement can be paid. Please contact your finance team if anything looks unexpected.";
  }
  return "Some finance items have been flagged for operator review. Your statement remains accurate; the team will reach out if anything affects your final payout.";
}

export function buildOwnerStatementBulletPoints(input: {
  groups: ReadonlyArray<StatementSourceGroupAggregate>;
  currency: string;
  netPayoutMinor: bigint;
  warningCounts: { info: number; warning: number; critical: number };
}): string[] {
  const { groups, currency, netPayoutMinor, warningCounts } = input;
  const bullets: string[] = [];
  const direct = findGroup(groups, "direct_booking_revenue");
  const ota = findGroup(groups, "ota_revenue");
  const services = findGroup(groups, "guest_service_revenue");
  if (direct && direct.grossAmountMinor > 0n) {
    bullets.push(
      `Direct bookings contributed ${formatMoneyMinor(direct.grossAmountMinor, currency)} in gross accommodation revenue.`,
    );
  }
  if (ota && ota.grossAmountMinor > 0n) {
    bullets.push(
      `OTA / platform bookings contributed ${formatMoneyMinor(ota.grossAmountMinor, currency)} before platform-related deductions.`,
    );
  }
  if (services && services.grossAmountMinor > 0n) {
    bullets.push(
      `Guest services and upsells added ${formatMoneyMinor(services.grossAmountMinor, currency)} in additional revenue.`,
    );
  }
  const deductionBuckets: StatementGroupKey[] = [
    "owner_stay_charges",
    "service_fulfilment_costs",
    "maintenance_charges",
    "utility_charges",
    "inventory_charges",
    "management_fees",
    "taxes",
  ];
  let totalDeductionsMinor = 0n;
  for (const key of deductionBuckets) {
    const g = findGroup(groups, key);
    if (g && g.deductionAmountMinor > 0n)
      totalDeductionsMinor += g.deductionAmountMinor;
  }
  const reserves = findGroup(groups, "reserves");
  if (reserves && reserves.deductionAmountMinor > 0n) {
    totalDeductionsMinor += reserves.deductionAmountMinor;
  }
  if (totalDeductionsMinor > 0n) {
    bullets.push(
      `Charges, fees, and reserve movements reduced this statement by ${formatMoneyMinor(totalDeductionsMinor, currency)}.`,
    );
  }
  bullets.push(
    netPayoutMinor < 0n
      ? `This period closed with a deficit of ${formatMoneyMinor(-netPayoutMinor, currency)}.`
      : `Your expected net payout for this statement is ${formatMoneyMinor(netPayoutMinor, currency)}.`,
  );
  if (warningCounts.warning + warningCounts.critical > 0) {
    bullets.push(
      "Some finance items need operator review before this statement should be paid.",
    );
  }
  return bullets;
}

// -----------------------------------------------------------------------------
// Helpers
// -----------------------------------------------------------------------------

function findGroup(
  groups: ReadonlyArray<StatementSourceGroupAggregate>,
  key: StatementGroupKey,
): StatementSourceGroupAggregate | null {
  return groups.find((g) => g.groupKey === key) ?? null;
}

function sumGroupNet(
  groups: ReadonlyArray<StatementSourceGroupAggregate>,
  keys: ReadonlyArray<StatementGroupKey>,
): bigint {
  let sum = 0n;
  for (const key of keys) {
    const g = findGroup(groups, key);
    if (g) sum += g.grossAmountMinor;
  }
  return sum;
}

function sumDeductionTotals(s: {
  totalFeesMinor: bigint;
  totalExpensesMinor: bigint;
  totalTaxesMinor: bigint;
  totalReservesMinor: bigint;
  managementFeeMinor: bigint;
}): bigint {
  return (
    s.totalFeesMinor +
    s.totalExpensesMinor +
    s.totalTaxesMinor +
    s.totalReservesMinor +
    s.managementFeeMinor
  );
}

// Re-export for convenience.
export { formatMoneyMinor };

// Token used in source-grep tests: the explanation copy must never
// contain raw internal identifiers.  Listed here for documentation.
export const BANNED_EXPLANATION_TOKENS: ReadonlyArray<string> = [
  "revenueLineId",
  "revenue_line_id",
  "expenseLineId",
  "expense_line_id",
  "statementLineId",
  "statement_line_id",
  "financeLinkId",
  "finance_link_id",
  "providerSessionId",
  "providerAccountId",
  "tokenHash",
  "holdTokenHash",
  "webhookPayload",
  "configPrivateEncrypted",
];
