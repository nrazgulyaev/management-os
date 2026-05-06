export type ContractGroupStatus =
  | "draft"
  | "pending_signature"
  | "partial_signed"
  | "fully_signed"
  | "in_payment"
  | "completed"
  | "cancelled"
  | "breached";

export type ContractStatus =
  | "draft"
  | "pending_signature"
  | "signed"
  | "cancelled";

export type ContractGroupType = "off_plan_three_part" | "completed_leasehold";

export type ContractComponentType =
  | "leasehold_agreement"
  | "construction_management"
  | "service_fee"
  | "completed_leasehold"
  | "vat";

export type TaxBearer = "buyer" | "seller" | "split";

export type ContractTemplateApplicableTo =
  | "off_plan"
  | "completed_villa"
  | "both";

export interface ContractTemplateData {
  id: string;
  name: string;
  description: string | null;
  applicableTo: ContractTemplateApplicableTo;
  isActive: boolean;
  components: ContractTemplateComponentData[];
}

export interface ContractTemplateComponentData {
  id: string;
  templateId: string;
  sequence: number;
  componentType: ContractComponentType;
  componentName: string;
  defaultAmountFormula: "percent_of_total" | "flat_amount" | "computed_remainder";
  defaultPercentValue: number | null;
  defaultFlatAmountUsdMinor: bigint | null;
  defaultTaxRate: number;
  defaultTaxBearer: TaxBearer;
  defaultSplitPercent: number | null;
  description: string | null;
}

export interface ContractRow {
  id: string;
  contractGroupId: string;
  sequence: number;
  componentType: ContractComponentType;
  componentName: string;
  amountUsdMinor: bigint;
  amountIdrMinor: bigint;
  fxRate: number;
  taxRate: number;
  taxBearer: TaxBearer;
  taxAmountUsdMinor: bigint;
  netReceivedBySellerUsdMinor: bigint;
  status: ContractStatus;
  signedAt: string | null;
  signedDocumentId: string | null;
  generatedDraftDocumentId: string | null;
  notes: string | null;
}

export interface ContractGroupListItem {
  id: string;
  contactId: string;
  contactFullName: string;
  villaId: string;
  villaCode: string;
  villaName: string | null;
  projectId: string;
  projectName: string;
  projectSlug: string;
  templateId: string;
  templateName: string;
  /** Display-only: name of the sales scheme attached to the group. */
  salesSchemeName: string | null;
  reservationId: string | null;
  groupType: ContractGroupType;
  totalContractValueUsdMinor: bigint;
  totalContractValueIdrMinor: bigint;
  fxRateAtSigning: number;
  status: ContractGroupStatus;
  marketPriceAtSigningUsdMinor: bigint;
  contractDate: string;
  firstSignedAt: string | null;
  fullySignedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  cancelledReason: string | null;
  notes: string | null;
  createdAt: string;
}

export type SchemeMilestoneTriggerType =
  | "on_signing"
  | "construction_progress_pct"
  | "days_after_previous"
  | "days_after_signing"
  | "fixed_date_offset"
  | "on_handover"
  | "days_after_handover";

export interface SalesSchemeData {
  id: string;
  projectId: string | null;
  name: string;
  description: string | null;
  isActive: boolean;
  isLocked: boolean;
  milestones: SalesSchemeMilestoneData[];
}

export interface SalesSchemeMilestoneData {
  id: string;
  salesSchemeId: string;
  sequence: number;
  name: string;
  triggerType: SchemeMilestoneTriggerType;
  triggerValue: number | null;
  collectionPercent: number;
  preInvoiceDaysBeforeTrigger: number;
  dueDaysAfterInvoice: number;
  isFinalPayment: boolean;
  description: string | null;
}

import type { ContractMilestoneRow } from "./payments";

export interface ContractGroupDetail extends ContractGroupListItem {
  contracts: ContractRow[];
  milestones: ContractMilestoneRow[];
  salesSchemeId: string | null;
  salesSchemeName: string | null;
  discountAppliedId: string | null;
}
