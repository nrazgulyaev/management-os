/**
 * Client-safe types + constants for the 2FA-gated payout-edit flow.
 *
 * Kept separate from payout-edit-actions.ts because that file is
 * "use server" and may export ONLY async functions.
 */

export type PayoutMethodTypeValue = "bank_idr" | "bank_intl" | "wise";

export interface PayoutMethodTypeOption {
  value: PayoutMethodTypeValue;
  label: string;
}

export const PAYOUT_METHOD_TYPE_OPTIONS: PayoutMethodTypeOption[] = [
  { value: "bank_idr", label: "Indonesian bank (IDR)" },
  { value: "bank_intl", label: "International bank wire" },
  { value: "wise", label: "Wise · multi-currency" },
];

/** Result of step 1 — request a confirmation code to gate the edit. */
export type PayoutCodeState =
  | { ok: true; demoCode: string; expiresInSeconds: number }
  | { ok: false; error: string }
  | null;

/** Result of step 2 — verify the code and persist the new payout method. */
export type PayoutSaveState = { ok: boolean; error?: string } | null;

/** Read shape for pre-filling the edit form (no secrets — masked tail only). */
export interface PayoutEditView {
  hasMethod: boolean;
  methodType: PayoutMethodTypeValue;
  currency: string;
  accountLabel: string;
  bankName: string;
  maskedAccount: string;
}
