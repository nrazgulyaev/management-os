"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { assignBookingToVillaAction } from "@/features/availability/actions";
import { SubmitButton } from "@/components/admin/submit-button";
import { selectCls } from "@/components/admin/form-shell";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Safe villa reassignment for a booking. Posts `{ bookingId, villaId }` to
 * `assignBookingToVillaAction` (perm `front_office.write`), which runs
 * `detectAvailabilityConflicts` + re-syncs the calendar block server-side.
 *
 * This is the *recommended* way to change a booking's villa: unlike the raw
 * BookingForm villa <select>, a conflicting target is rejected (the action's
 * error is shown inline, no navigation) instead of silently double-booking.
 */
export function MoveToVillaControl({
  bookingId,
  currentVillaId,
  villas,
}: {
  bookingId: string;
  currentVillaId: string;
  villas: { id: string; label: string }[];
}) {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(
    assignBookingToVillaAction,
    null,
  );
  const router = useRouter();
  const [target, setTarget] = useState(currentVillaId);

  useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  const unchanged = target === currentVillaId;

  return (
    <form action={dispatch} className="flex flex-col gap-2">
      <input type="hidden" name="bookingId" value={bookingId} />
      <select
        name="villaId"
        value={target}
        onChange={(e) => setTarget(e.target.value)}
        disabled={pending}
        className={`${selectCls} w-full`}
        aria-label="Move booking to villa"
      >
        {villas.map((v) => (
          <option key={v.id} value={v.id}>
            {v.label}
          </option>
        ))}
      </select>
      {state && !state.ok && state.error && (
        <span className="text-[11px] text-danger">{state.error}</span>
      )}
      <SubmitButton
        size="sm"
        variant="secondary"
        disabled={unchanged}
        pendingLabel="Moving…"
        className="w-full"
      >
        Move to villa
      </SubmitButton>
    </form>
  );
}
