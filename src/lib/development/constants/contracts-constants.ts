/**
 * Pure constants for contracts. Safe to import from any client component.
 */

import type {
  ContractComponentType,
  ContractGroupStatus,
  ContractStatus,
  ContractGroupType,
  TaxBearer,
} from "@/lib/development/types/contracts";

export const CONTRACT_GROUP_STATUSES: ContractGroupStatus[] = [
  "draft",
  "pending_signature",
  "partial_signed",
  "fully_signed",
  "in_payment",
  "completed",
  "cancelled",
  "breached",
];

export const CONTRACT_GROUP_STATUS_LABEL: Record<ContractGroupStatus, string> = {
  draft: "Draft",
  pending_signature: "Pending signature",
  partial_signed: "Partially signed",
  fully_signed: "Fully signed",
  in_payment: "In payment",
  completed: "Completed",
  cancelled: "Cancelled",
  breached: "Breached",
};

export const CONTRACT_STATUSES: ContractStatus[] = [
  "draft",
  "pending_signature",
  "signed",
  "cancelled",
];

export const CONTRACT_STATUS_LABEL: Record<ContractStatus, string> = {
  draft: "Draft",
  pending_signature: "Pending signature",
  signed: "Signed",
  cancelled: "Cancelled",
};

export const COMPONENT_TYPES: ContractComponentType[] = [
  "leasehold_agreement",
  "construction_management",
  "service_fee",
  "completed_leasehold",
  "vat",
];

export const COMPONENT_TYPE_LABEL: Record<ContractComponentType, string> = {
  leasehold_agreement: "Leasehold agreement",
  construction_management: "Construction management",
  service_fee: "Service fee",
  completed_leasehold: "Completed leasehold",
  vat: "VAT",
};

export const GROUP_TYPE_LABEL: Record<ContractGroupType, string> = {
  off_plan_three_part: "Off-plan (3 parts)",
  completed_leasehold: "Completed leasehold",
};

export const TAX_BEARER_LABEL: Record<TaxBearer, string> = {
  buyer: "Buyer-borne",
  seller: "Seller-borne",
  split: "Split 50/50",
};
