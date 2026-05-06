"use client";

import { useFormState, useFormStatus } from "react-dom";
import { Button } from "@/components/ui/button";
import {
  rebuildOwnerBookingSummariesAction,
  rebuildOwnerBookingSummaryForBookingAction,
  rebuildOwnerBookingSummaryForDirectRequestAction,
  rebuildOwnerRevenueSourceMonthlyAction,
} from "@/features/owner-bookings/actions";

export function RebuildAllProjectionsButton() {
  const [state, action] = useFormState(rebuildOwnerBookingSummariesAction, null);
  return (
    <form action={action}>
      <Pending label="Rebuild all owner projections" busyLabel="Rebuilding…" />
      {state && state.ok && (
        <p className="text-[11px] text-success mt-1">
          Rebuilt {state.summaries ?? 0} summaries across{" "}
          {state.ownersProcessed ?? 0} owner{state.ownersProcessed === 1 ? "" : "s"}.
        </p>
      )}
      {state && !state.ok && (
        <p className="text-[11px] text-danger mt-1">{state.error}</p>
      )}
    </form>
  );
}

export function RebuildMonthlyButton() {
  const [state, action] = useFormState(
    rebuildOwnerRevenueSourceMonthlyAction,
    null,
  );
  return (
    <form action={action}>
      <Pending label="Rebuild monthly aggregates" busyLabel="Rebuilding…" />
      {state && state.ok && (
        <p className="text-[11px] text-success mt-1">
          Rebuilt {state.upserted ?? 0} bucket{state.upserted === 1 ? "" : "s"}.
        </p>
      )}
      {state && !state.ok && (
        <p className="text-[11px] text-danger mt-1">{state.error}</p>
      )}
    </form>
  );
}

export function RebuildBookingProjectionButton({ bookingId }: { bookingId: string }) {
  const [state, action] = useFormState(
    rebuildOwnerBookingSummaryForBookingAction,
    null,
  );
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="bookingId" value={bookingId} />
      <Pending label="Rebuild" busyLabel="…" small />
      {state && state.ok && (
        <span className="text-[11px] text-success ml-2">Done.</span>
      )}
      {state && !state.ok && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function RebuildDirectRequestProjectionButton({
  requestId,
}: {
  requestId: string;
}) {
  const [state, action] = useFormState(
    rebuildOwnerBookingSummaryForDirectRequestAction,
    null,
  );
  return (
    <form action={action} className="inline-block">
      <input type="hidden" name="requestId" value={requestId} />
      <Pending label="Rebuild" busyLabel="…" small />
      {state && state.ok && (
        <span className="text-[11px] text-success ml-2">Done.</span>
      )}
      {state && !state.ok && (
        <span className="text-[11px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

function Pending({
  label,
  busyLabel,
  small,
}: {
  label: string;
  busyLabel: string;
  small?: boolean;
}) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size={small ? "sm" : undefined} disabled={pending}>
      {pending ? busyLabel : label}
    </Button>
  );
}
