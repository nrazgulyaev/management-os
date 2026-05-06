/**
 * Pure helpers for the procurement approval matrix. Extracted from the
 * server module so tests can import without `server-only`.
 *
 * The approval matrix is operator-configurable (rows in
 * `approval_thresholds`). This helper picks the matching row for a
 * given (threshold_type, amount) tuple and returns the required
 * approver role. Currency conversion is the caller's responsibility —
 * we work in the threshold's native currency.
 */

export type ApprovalRole =
  | "auto_approved"
  | "procurement_manager"
  | "project_manager"
  | "finance_manager"
  | "director"
  | "investor_approval"
  | "reserved_matter";

export type ThresholdType =
  | "purchase_request"
  | "change_order"
  | "budget_overrun"
  | "discount"
  | "distribution"
  | "capital_call"
  | "custom";

export interface ApprovalThresholdRow {
  thresholdType: ThresholdType | string;
  amountMinorMin: bigint;
  amountMinorMax: bigint | null;
  currency: string;
  requiredRole: ApprovalRole | string;
  requiredApproverCount: number;
  isActive: boolean;
}

export interface ApprovalLookupResult {
  requiredRole: ApprovalRole | string;
  requiredApproverCount: number;
  matchedRow: ApprovalThresholdRow | null;
}

/**
 * Find the threshold row that applies to (type, amount, currency).
 * Returns the row whose `[min, max]` envelope contains the amount.
 * `max=null` means no upper bound. When multiple rows match (caller
 * should prevent this via DB constraints), picks the one with the
 * narrowest envelope.
 *
 * If no row matches at all, returns the conservative default —
 * 'director' approval. This is intentional: a missing threshold
 * config should NOT auto-approve.
 */
export function lookupRequiredApproval(args: {
  thresholdType: ThresholdType | string;
  amountMinor: bigint;
  currency: string;
  thresholds: ApprovalThresholdRow[];
}): ApprovalLookupResult {
  const candidates = args.thresholds.filter(
    (t) =>
      t.isActive &&
      t.thresholdType === args.thresholdType &&
      t.currency === args.currency &&
      args.amountMinor >= t.amountMinorMin &&
      (t.amountMinorMax === null || args.amountMinor <= t.amountMinorMax),
  );
  if (candidates.length === 0) {
    return {
      requiredRole: "director",
      requiredApproverCount: 1,
      matchedRow: null,
    };
  }
  // Pick the narrowest envelope. A row with a defined max wins over
  // an open-ended row covering the same range.
  candidates.sort((a, b) => {
    const aSpan =
      a.amountMinorMax === null
        ? Number.MAX_SAFE_INTEGER
        : Number(a.amountMinorMax - a.amountMinorMin);
    const bSpan =
      b.amountMinorMax === null
        ? Number.MAX_SAFE_INTEGER
        : Number(b.amountMinorMax - b.amountMinorMin);
    return aSpan - bSpan;
  });
  const winner = candidates[0];
  return {
    requiredRole: winner.requiredRole,
    requiredApproverCount: winner.requiredApproverCount,
    matchedRow: winner,
  };
}

/**
 * Whether the actor's role satisfies the required role for the given
 * threshold result. Higher roles satisfy lower roles via this fixed
 * hierarchy (auto_approved < project_manager < procurement_manager <
 * finance_manager < director < investor_approval < reserved_matter).
 */
const ROLE_RANK: Record<string, number> = {
  auto_approved: 0,
  project_manager: 1,
  procurement_manager: 2,
  finance_manager: 3,
  director: 4,
  investor_approval: 5,
  reserved_matter: 6,
};

export function isRoleSufficient(
  actorRole: string,
  requiredRole: string,
): boolean {
  const actor = ROLE_RANK[actorRole];
  const required = ROLE_RANK[requiredRole];
  if (actor === undefined || required === undefined) return false;
  return actor >= required;
}
