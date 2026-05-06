import type {
  DiscountReason,
  DiscountStatus,
} from "@/lib/development/types/discounts";

export const DISCOUNT_REASONS: DiscountReason[] = [
  "early_bird",
  "family_friend",
  "cash_payment",
  "bulk",
  "agent_negotiation",
  "returning_buyer",
  "investor_relationship",
  "other",
];

export const DISCOUNT_REASON_LABEL: Record<DiscountReason, string> = {
  early_bird: "Early bird",
  family_friend: "Family / friend",
  cash_payment: "Cash payment",
  bulk: "Bulk (multiple units)",
  agent_negotiation: "Agent negotiation",
  returning_buyer: "Returning buyer",
  investor_relationship: "Investor relationship",
  other: "Other",
};

export const DISCOUNT_STATUSES: DiscountStatus[] = [
  "proposed",
  "pending_approval",
  "approved",
  "rejected",
  "applied",
  "reverted",
];

export const DISCOUNT_STATUS_LABEL: Record<DiscountStatus, string> = {
  proposed: "Proposed",
  pending_approval: "Pending approval",
  approved: "Approved",
  rejected: "Rejected",
  applied: "Applied",
  reverted: "Reverted",
};

/**
 * Default authorization tiers seeded by 0036.
 *
 * `dev_os_sales_manager` → 5% / escalate above 5%.
 * `dev_os_director`      → 15% / escalate above 15%.
 * `dev_os_ceo`           → unlimited.
 */
export const DEFAULT_DISCOUNT_TIERS = [
  {
    roleKey: "dev_os_sales_manager",
    maxPercent: 5,
    escalateToRoleKey: "dev_os_director",
    notes: "Sales managers can authorize up to 5% off market price.",
  },
  {
    roleKey: "dev_os_director",
    maxPercent: 15,
    escalateToRoleKey: "dev_os_ceo",
    notes: "Directors can authorize up to 15% off market price.",
  },
  {
    roleKey: "dev_os_ceo",
    maxPercent: null,
    escalateToRoleKey: null,
    notes: "CEO has unlimited discount authority.",
  },
] as const;
