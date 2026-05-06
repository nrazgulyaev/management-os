import type {
  InvoiceStatus,
  InvoiceType,
  MilestoneStatus,
} from "@/lib/development/types/payments";

export const MILESTONE_STATUSES: MilestoneStatus[] = [
  "pending",
  "pre_invoiced",
  "invoiced",
  "partially_paid",
  "paid",
  "overdue",
  "waived",
  "cancelled",
];

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: "Pending",
  pre_invoiced: "Pre-invoiced",
  invoiced: "Invoiced",
  partially_paid: "Partially paid",
  paid: "Paid",
  overdue: "Overdue",
  waived: "Waived",
  cancelled: "Cancelled",
};

export const INVOICE_STATUSES: InvoiceStatus[] = [
  "draft",
  "sent",
  "viewed",
  "paid",
  "overdue",
  "void",
];

export const INVOICE_STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  viewed: "Viewed",
  paid: "Paid",
  overdue: "Overdue",
  void: "Void",
};

export const INVOICE_TYPES: InvoiceType[] = [
  "pre_invoice",
  "standard_invoice",
  "final_invoice",
  "late_fee_invoice",
  "credit_note",
];

export const INVOICE_TYPE_LABEL: Record<InvoiceType, string> = {
  pre_invoice: "Pre-invoice",
  standard_invoice: "Standard invoice",
  final_invoice: "Final invoice",
  late_fee_invoice: "Late-fee invoice",
  credit_note: "Credit note",
};

export const RESERVATION_STATUS_LABEL = {
  pending_payment: "Pending payment",
  active: "Active",
  expired: "Expired",
  converted_to_contract: "Converted to contract",
  cancelled: "Cancelled",
  refunded: "Refunded",
} as const;

export const RESERVATION_PAYMENT_METHOD_LABEL = {
  bank_transfer: "Bank transfer",
  crypto_usdt: "Crypto · USDT",
  crypto_other: "Crypto · other",
  cash: "Cash",
  card: "Card",
} as const;
