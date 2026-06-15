"use client";

import { useState } from "react";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { MoneyInput } from "@/components/finance/money-input";
import { useModalOrRouteForm } from "@/lib/forms/use-modal-or-route-form";
import { createCheckinCheckoutRequestAction } from "@/features/front-office/actions";
import type { ActionResult } from "@/features/projects/actions";

export interface CheckinCheckoutRequestBookingOption {
  id: string;
  /** e.g. "ARC-A-00241 — ES-S5" */
  label: string;
  villaId: string;
}

/**
 * Create a check-in / check-out request from the front desk. Backed by
 * `createCheckinCheckoutRequestAction` (perm `front_office.write`, org-scoped).
 * The action re-validates the booking belongs to the caller's org and mints the
 * request `status: "requested"`. Field names mirror
 * `createCheckinCheckoutRequestSchema` exactly:
 *   bookingId, villaId?, requestType (early_checkin | late_checkout |
 *   expected_checkout_time | early_checkout_notice), requestedTime?,
 *   feeAmountMinor?, currency?, guestMessage?
 * Follows the Modal-First contract (`onSuccess`/`onCancel`).
 */
const REQUEST_TYPES: { value: string; label: string }[] = [
  { value: "early_checkin", label: "Early check-in" },
  { value: "late_checkout", label: "Late check-out" },
  { value: "expected_checkout_time", label: "Expected checkout time" },
  { value: "early_checkout_notice", label: "Early checkout notice" },
];

export function CheckinCheckoutRequestForm({
  bookings,
  onSuccess,
  onCancel,
}: {
  bookings: CheckinCheckoutRequestBookingOption[];
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { state, submitAction, pending } = useModalOrRouteForm<
    ActionResult & { requestId?: string }
  >(createCheckinCheckoutRequestAction, { onSuccess });
  const [bookingId, setBookingId] = useState("");
  const [currency, setCurrency] = useState("USD");
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  // The action accepts an optional villaId; derive it from the chosen booking
  // so the request row joins cleanly on the requests list.
  const villaId = bookings.find((b) => b.id === bookingId)?.villaId ?? "";

  return (
    <form action={submitAction}>
      <input type="hidden" name="villaId" value={villaId} />
      <FormShell
        title="New request"
        footer={
          <>
            {onCancel && (
              <Button type="button" variant="ghost" onClick={onCancel} disabled={pending}>
                Cancel
              </Button>
            )}
            <SubmitButton>Create request</SubmitButton>
          </>
        }
      >
        {state && !state.ok && state.error && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Booking" required error={errs.bookingId?.[0]}>
          <select
            name="bookingId"
            required
            value={bookingId}
            onChange={(e) => setBookingId(e.target.value)}
            className={selectCls}
          >
            <option value="" disabled>
              Select booking…
            </option>
            {bookings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Request type" required error={errs.requestType?.[0]}>
          <select name="requestType" required defaultValue="" className={selectCls}>
            <option value="" disabled>
              Select type…
            </option>
            {REQUEST_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Requested time"
          error={errs.requestedTime?.[0]}
          hint="When the guest wants the early check-in / late check-out (optional)."
        >
          <input type="datetime-local" name="requestedTime" className={inputCls} />
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <MoneyInput
            label="Fee"
            name="feeAmountMinor"
            currency={currency}
            error={errs.feeAmountMinor?.[0]}
          />
          <Field label="Currency" error={errs.currency?.[0]}>
            <select
              name="currency"
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className={selectCls}
            >
              {["USD", "IDR", "EUR", "GBP", "AUD", "SGD"].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field
          label="Guest message"
          error={errs.guestMessage?.[0]}
          hint="Optional note from / for the guest."
        >
          <textarea
            name="guestMessage"
            rows={3}
            className={textareaCls}
            placeholder="e.g. Guest requests 10am late checkout, flight at 2pm."
          />
        </Field>
      </FormShell>
    </form>
  );
}
