"use client";

import { useActionState } from "react";
import Link from "next/link";
import { Field, FormShell, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createBookingAction, updateBookingAction } from "./actions";
import type { ActionResult } from "@/features/projects/actions";

const initial: ActionResult | null = null;

export interface BookingFormDefaults {
  id?: string;
  villaId?: string;
  channelId?: string | null;
  guestId?: string | null;
  bookingCode?: string;
  sourceReference?: string | null;
  status?: string;
  checkIn?: string;
  checkOut?: string;
  adults?: number | null;
  children?: number | null;
  currency?: string;
  grossAmount?: number;
  cleaningFeeAmount?: number;
  channelFeeAmount?: number;
  paymentFeeAmount?: number;
  notes?: string | null;
}

export function BookingForm({
  mode,
  villas,
  channels,
  guests,
  defaults,
  cancelHref = "/dashboard/bookings",
}: {
  mode: "create" | "edit";
  villas: { id: string; label: string }[];
  channels: { id: string; label: string; key: string }[];
  guests: { id: string; label: string }[];
  defaults?: BookingFormDefaults;
  cancelHref?: string;
}) {
  const action = mode === "edit" ? updateBookingAction : createBookingAction;
  const [state, dispatch] = useActionState(action, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const v = defaults ?? {};
  return (
    <form action={dispatch}>
      {mode === "edit" && v.id && <input type="hidden" name="id" value={v.id} />}
      <FormShell
        title={mode === "edit" ? "Edit booking" : "Booking details"}
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href={cancelHref}>Cancel</Link>
            </Button>
            <SubmitButton>{mode === "edit" ? "Save changes" : "Create booking"}</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Villa" required error={errs.villaId?.[0]}>
            <select
              name="villaId"
              required
              defaultValue={v.villaId ?? ""}
              className={selectCls}
            >
              <option value="" disabled>
                Pick a villa
              </option>
              {villas.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Booking code" required error={errs.bookingCode?.[0]}>
            <input
              name="bookingCode"
              required
              defaultValue={v.bookingCode}
              className={inputCls}
              placeholder="ARC-D-00100"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <Field label="Channel">
            <select
              name="channelId"
              defaultValue={v.channelId ?? ""}
              className={selectCls}
            >
              <option value="">Direct (none)</option>
              {channels.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Guest">
            <select
              name="guestId"
              defaultValue={v.guestId ?? ""}
              className={selectCls}
            >
              <option value="">No guest record yet</option>
              {guests.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Check-in" required error={errs.checkIn?.[0]}>
            <input
              type="date"
              name="checkIn"
              required
              defaultValue={v.checkIn}
              className={inputCls}
            />
          </Field>
          <Field label="Check-out" required error={errs.checkOut?.[0]}>
            <input
              type="date"
              name="checkOut"
              required
              defaultValue={v.checkOut}
              className={inputCls}
            />
          </Field>
          <Field label="Status" required>
            <select
              name="status"
              defaultValue={v.status ?? "confirmed"}
              className={selectCls}
            >
              {[
                "inquiry",
                "tentative",
                "confirmed",
                "checked_in",
                "checked_out",
                "cancelled",
                "no_show",
              ].map((s) => (
                <option key={s} value={s}>
                  {s.replace("_", " ")}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Adults">
            <input
              type="number"
              name="adults"
              min={0}
              defaultValue={v.adults ?? undefined}
              className={inputCls}
            />
          </Field>
          <Field label="Children">
            <input
              type="number"
              name="children"
              min={0}
              defaultValue={v.children ?? undefined}
              className={inputCls}
            />
          </Field>
          <Field label="Currency" required>
            <input
              name="currency"
              defaultValue={v.currency ?? "USD"}
              maxLength={3}
              className={inputCls}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="Gross amount" required error={errs.grossAmount?.[0]}>
            <input
              type="number"
              name="grossAmount"
              min={0}
              step="0.01"
              required
              defaultValue={v.grossAmount}
              className={inputCls}
            />
          </Field>
          <Field label="Cleaning fee">
            <input
              type="number"
              name="cleaningFeeAmount"
              min={0}
              step="0.01"
              defaultValue={v.cleaningFeeAmount ?? 0}
              className={inputCls}
            />
          </Field>
          <Field label="Channel fee">
            <input
              type="number"
              name="channelFeeAmount"
              min={0}
              step="0.01"
              defaultValue={v.channelFeeAmount ?? 0}
              className={inputCls}
            />
          </Field>
          <Field label="Payment fee">
            <input
              type="number"
              name="paymentFeeAmount"
              min={0}
              step="0.01"
              defaultValue={v.paymentFeeAmount ?? 0}
              className={inputCls}
            />
          </Field>
        </div>

        <Field label="Notes">
          <textarea
            name="notes"
            rows={3}
            defaultValue={v.notes ?? ""}
            className={textareaCls}
          />
        </Field>
      </FormShell>
    </form>
  );
}
