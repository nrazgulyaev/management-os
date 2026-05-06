export type MilestoneStatus =
  | "pending"
  | "pre_invoiced"
  | "invoiced"
  | "partially_paid"
  | "paid"
  | "overdue"
  | "waived"
  | "cancelled";

export type InvoiceStatus =
  | "draft"
  | "sent"
  | "viewed"
  | "paid"
  | "overdue"
  | "void";

export type InvoiceType =
  | "pre_invoice"
  | "standard_invoice"
  | "final_invoice"
  | "late_fee_invoice"
  | "credit_note";

export type LateFeeType =
  | "flat_fee"
  | "percent_per_day"
  | "percent_per_month"
  | "tiered";

export type LateFeeStatus = "accrued" | "invoiced" | "paid" | "waived";

export interface ContractMilestoneRow {
  id: string;
  contractGroupId: string;
  sourceMilestoneId: string | null;
  sequence: number;
  name: string;
  triggerType: string;
  triggerValue: number | null;
  collectionPercent: number;
  expectedAmountUsdMinor: bigint;
  expectedAmountIdrMinor: bigint;
  fxRateExpected: number;
  expectedDueDate: string | null;
  preInvoiceDate: string | null;
  status: MilestoneStatus;
  preInvoicedAt: string | null;
  invoicedAt: string | null;
  paidAmountUsdMinor: bigint;
  paidAt: string | null;
  overdueAt: string | null;
  lateFeeAccrualUsdMinor: bigint;
  notes: string | null;
}

export interface InvoiceListItem {
  id: string;
  contractMilestoneId: string;
  contractGroupId: string;
  contactId: string;
  contactFullName: string;
  contactEmail: string | null;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  issuedAt: string;
  dueDate: string;
  amountUsdMinor: bigint;
  amountIdrMinor: bigint;
  currency: string;
  language: string;
  status: InvoiceStatus;
  sentAt: string | null;
  sentTo: string | null;
  paidAt: string | null;
  documentId: string | null;
}

export interface InvoiceDetail extends InvoiceListItem {
  fxRate: number;
  voidedAt: string | null;
  voidedReason: string | null;
  notes: string | null;
  /** Optional joined view: the milestone the invoice was issued for. */
  milestoneName: string | null;
}

export interface LateFeeAccrualRow {
  id: string;
  contractMilestoneId: string;
  ruleId: string;
  accruedAt: string;
  daysOverdue: number;
  feeAmountUsdMinor: bigint;
  feeAmountIdrMinor: bigint;
  fxRate: number;
  status: LateFeeStatus;
  notes: string | null;
}

export interface LateFeeRuleData {
  id: string;
  projectId: string;
  gracePeriodDays: number;
  feeType: LateFeeType;
  feeValue: number;
  feeCurrency: string;
  maxFeeUsdMinor: bigint | null;
  isActive: boolean;
  notes: string | null;
}
