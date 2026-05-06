export type DiscountStatus =
  | "proposed"
  | "pending_approval"
  | "approved"
  | "rejected"
  | "applied"
  | "reverted";

export type DiscountReason =
  | "early_bird"
  | "family_friend"
  | "cash_payment"
  | "bulk"
  | "agent_negotiation"
  | "returning_buyer"
  | "investor_relationship"
  | "other";

export type DiscountType = "percent" | "fixed_amount";

export interface UnitDiscountListItem {
  id: string;
  villaId: string;
  villaCode: string;
  contactId: string;
  contactFullName: string;
  contractGroupId: string | null;
  discountType: DiscountType;
  discountPercent: number | null;
  discountAmountUsdMinor: bigint | null;
  appliedToOriginalPriceUsdMinor: bigint;
  finalPriceUsdMinor: bigint;
  reason: DiscountReason;
  reasonNote: string | null;
  proposedBy: string | null;
  proposedAt: string;
  status: DiscountStatus;
  escalationRequired: boolean;
  escalatedTo: string | null;
  escalatedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  appliedAt: string | null;
}

export interface DiscountAuthorizationLimit {
  id: string;
  roleKey: string;
  maxPercentValue: number | null;
  maxAbsoluteUsdMinor: bigint | null;
  requiresEscalationAbovePercent: number | null;
  escalateToRoleKey: string | null;
  notes: string | null;
  isActive: boolean;
}

/** Result of evaluating a proposed discount against a user's authorization. */
export interface DiscountEvaluation {
  withinAuthority: boolean;
  needsEscalation: boolean;
  escalateToRoleKey: string | null;
  reason: string;
}
