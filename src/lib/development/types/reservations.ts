export type ReservationStatus =
  | "pending_payment"
  | "active"
  | "expired"
  | "converted_to_contract"
  | "cancelled"
  | "refunded";

export type ReservationPaymentMethod =
  | "bank_transfer"
  | "crypto_usdt"
  | "crypto_other"
  | "cash"
  | "card";

export interface ReservationListItem {
  id: string;
  contactId: string;
  contactFullName: string;
  contactEmail: string | null;
  contactPhone: string | null;
  villaId: string;
  villaCode: string;
  villaName: string | null;
  projectId: string;
  projectName: string;
  projectSlug: string;
  reservationFeeUsdMinor: bigint;
  reservationFeeIdrMinor: bigint;
  paymentMethod: ReservationPaymentMethod;
  paymentReference: string | null;
  paidAt: string | null;
  status: ReservationStatus;
  expiresAt: string | null;
  priceLockedUsdMinor: bigint;
  notes: string | null;
  createdAt: string;
  cancelledAt: string | null;
  cancelledReason: string | null;
}

export interface ReservationDetail extends ReservationListItem {
  contactRoleId: string | null;
  fxRateAtReservation: number;
  refundedAmountUsdMinor: bigint | null;
  refundedAt: string | null;
  priceLockedSnapshotId: string | null;
}
