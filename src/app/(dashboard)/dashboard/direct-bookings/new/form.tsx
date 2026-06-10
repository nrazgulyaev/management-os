"use client";

import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import Link from "next/link";
import {
  Field,
  FormShell,
  inputCls,
  selectCls,
  textareaCls,
} from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createDirectBookingOnBehalfAction } from "@/features/direct-booking/operator-create";
import type { ActionResult } from "@/features/projects/actions";

interface VillaOption {
  id: string;
  label: string;
}

const initial: (ActionResult & { holdId?: string }) | null = null;

export function CreateDirectBookingForm({ villas }: { villas: VillaOption[] }) {
  const router = useRouter();
  const [state, dispatch] = useActionState(
    createDirectBookingOnBehalfAction,
    initial,
  );
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};

  useEffect(() => {
    if (state?.ok && state.holdId) {
      router.push(`/dashboard/direct-bookings/${state.holdId}`);
    }
  }, [state, router]);

  return (
    <form action={dispatch}>
      <FormShell
        title="Direct hold on behalf of a guest"
        footer={
          <>
            <Button asChild variant="ghost">
              <Link href="/dashboard/direct-bookings/holds">Cancel</Link>
            </Button>
            <SubmitButton>Place hold</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-2xl border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}

        <Field label="Villa" required error={errs.villaId?.[0]}>
          <select name="villaId" required defaultValue="" className={selectCls}>
            <option value="" disabled>
              Select a villa…
            </option>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          <Field label="Check-in" required error={errs.checkIn?.[0]}>
            <input type="date" name="checkIn" required className={inputCls} />
          </Field>
          <Field label="Check-out" required error={errs.checkOut?.[0]}>
            <input type="date" name="checkOut" required className={inputCls} />
          </Field>
          <Field label="Guests" required error={errs.guestCount?.[0]}>
            <input
              type="number"
              name="guestCount"
              min={1}
              max={40}
              defaultValue={2}
              className={inputCls}
            />
          </Field>
        </div>

        <p className="text-xs text-ink-tertiary">
          The hold is priced live from the dynamic-pricing engine and blocks
          the dates on every connected channel. Capture the guest now to open a
          request in the same step, or leave the guest section empty to place a
          bare hold and capture details later. Settlement is manual — no card is
          charged here.
        </p>

        <div className="rounded-2xl border border-line-soft bg-canvas/40 p-5 flex flex-col gap-5">
          <div className="text-[11px] font-mono uppercase tracking-widest text-ink-tertiary">
            Guest (optional)
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="First name" error={errs.guestFirstName?.[0]}>
              <input
                name="guestFirstName"
                className={inputCls}
                placeholder="Marco"
              />
            </Field>
            <Field label="Last name">
              <input
                name="guestLastName"
                className={inputCls}
                placeholder="Park"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="Email" error={errs.guestEmail?.[0]}>
              <input
                type="email"
                name="guestEmail"
                className={inputCls}
                placeholder="guest@example.com"
              />
            </Field>
            <Field label="Phone">
              <input
                name="guestPhone"
                className={inputCls}
                placeholder="+62 …"
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <Field label="Country">
              <input name="guestCountry" className={inputCls} placeholder="IT" />
            </Field>
            <Field label="Arrival time">
              <input
                name="arrivalTime"
                className={inputCls}
                placeholder="14:20"
              />
            </Field>
            <Field label="Purpose">
              <select name="purposeOfStay" defaultValue="" className={selectCls}>
                <option value="">—</option>
                <option value="holiday">Holiday</option>
                <option value="family">Family</option>
                <option value="honeymoon">Honeymoon</option>
                <option value="business">Business</option>
                <option value="event">Event</option>
                <option value="other">Other</option>
              </select>
            </Field>
          </div>
          <Field label="Special requests">
            <textarea
              name="specialRequests"
              rows={3}
              className={textareaCls}
              placeholder="Airport pickup, high chair, late check-out…"
            />
          </Field>
        </div>
      </FormShell>
    </form>
  );
}
