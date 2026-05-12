"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Field, FormShell, inputCls, selectCls } from "@/components/admin/form-shell";
import { SubmitButton } from "@/components/admin/submit-button";
import { Button } from "@/components/ui/button";
import { createCalendarFeedAction } from "@/features/integrations/calendar-sync/actions";
import type { ActionResult } from "@/features/projects/actions";

interface Option {
  id: string;
  label: string;
}

const initial: ActionResult | null = null;

export function CalendarFeedForm({
  villas,
  channels,
  cancelHref,
  onSuccess,
  onCancel,
}: {
  villas: Option[];
  channels: Option[];
  cancelHref: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const [state, dispatch] = useActionState(createCalendarFeedAction, initial);
  const errs = state && !state.ok ? state.fieldErrors ?? {} : {};
  const router = useRouter();
  useEffect(() => {
    if (state?.ok) {
      if (onSuccess) onSuccess();
      else if (state.redirectTo) router.push(state.redirectTo);
    }
  }, [state, router, onSuccess]);

  return (
    <form action={dispatch}>
      <FormShell
        title="Add a calendar feed"
        description="iCal/ICS URL from Airbnb, Booking.com, Vrbo, or any external calendar."
        footer={
          <>
            {onCancel ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            ) : (
              <Button asChild variant="ghost"><a href={cancelHref}>Cancel</a></Button>
            )}
            <SubmitButton>Add feed</SubmitButton>
          </>
        }
      >
        {state && !state.ok && (
          <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
            {state.error}
          </div>
        )}
        <Field label="Feed name" required error={errs.feedName?.[0]}>
          <input
            name="feedName"
            required
            className={inputCls}
            placeholder="Airbnb · EV-S5"
          />
        </Field>
        <Field label="Villa" required error={errs.villaId?.[0]}>
          <select name="villaId" defaultValue="" required className={selectCls}>
            <option value="" disabled>Pick a villa</option>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Channel">
            <select name="bookingChannelId" defaultValue="" className={selectCls}>
              <option value="">— None</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Feed type">
            <select name="feedType" defaultValue="ical" className={selectCls}>
              <option value="ical">iCal (generic)</option>
              <option value="airbnb_ical">Airbnb iCal</option>
              <option value="booking_ical">Booking.com iCal</option>
              <option value="vrbo_ical">Vrbo iCal</option>
              <option value="manual_ics">Manual ICS</option>
            </select>
          </Field>
        </div>
        <Field
          label="Feed URL"
          required
          hint="https://… — secrets are never displayed to owners or guests."
          error={errs.feedUrl?.[0]}
        >
          <input
            name="feedUrl"
            type="url"
            required
            className={inputCls}
            placeholder="https://www.airbnb.com/calendar/ical/123456.ics?s=..."
          />
        </Field>
        <Field label="Sync interval (minutes)">
          <input
            type="number"
            min={15}
            max={60 * 24}
            name="syncIntervalMinutes"
            defaultValue={180}
            className={inputCls}
          />
        </Field>
      </FormShell>
    </form>
  );
}
