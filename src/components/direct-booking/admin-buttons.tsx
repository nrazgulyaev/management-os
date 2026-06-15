"use client";

import { useActionState } from "react";
import {
  approveDirectBookingRequestAction,
  cancelDirectBookingHoldAction,
  convertDirectBookingRequestToBookingAction,
  markDirectBookingUnderReviewAction,
  rejectDirectBookingRequestAction,
} from "@/features/direct-booking/actions";

export function MarkUnderReviewButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(
    markDirectBookingUnderReviewAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink hover:underline underline-offset-4"
      >
        Take review
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function ApproveRequestForm({ id }: { id: string }) {
  const [state, dispatch] = useActionState(
    approveDirectBookingRequestAction,
    null,
  );
  return (
    <form action={dispatch} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="decisionNote"
        placeholder="note (optional)"
        className="h-8 px-2 rounded-md border border-line-soft bg-canvas text-xs"
      />
      <button
        type="submit"
        className="h-8 px-3 rounded-full bg-success text-ink-inverse text-xs font-medium hover:bg-success/90"
      >
        Approve
      </button>
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function RejectRequestForm({ id }: { id: string }) {
  const [state, dispatch] = useActionState(
    rejectDirectBookingRequestAction,
    null,
  );
  return (
    <form action={dispatch} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="decisionNote"
        placeholder="reason"
        className="h-8 px-2 rounded-md border border-line-soft bg-canvas text-xs"
      />
      <button
        type="submit"
        className="h-8 px-3 rounded-full border border-line-soft text-xs hover:border-line-strong"
      >
        Reject
      </button>
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function ConvertToBookingButton({
  id,
  canOverride = false,
}: {
  id: string;
  /**
   * When true (director / super_admin / booking_manager — i.e. the holder
   * of `direct_booking.manage`), expose the "convert without paid deposit"
   * override. The action forces `finalStatus` to `tentative` on that path.
   */
  canOverride?: boolean;
}) {
  const [state, dispatch] = useActionState(
    convertDirectBookingRequestToBookingAction,
    null,
  );
  return (
    <form action={dispatch} className="flex flex-col gap-2">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="finalStatus" value="confirmed" />
      <div className="inline-flex items-center gap-2">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Convert to booking
        </button>
        {state?.ok && state.bookingCode && (
          <span className="text-xs text-success font-mono">
            {state.bookingCode}
          </span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
      {canOverride && (
        <div className="flex flex-col gap-1.5 rounded-md border border-line-soft bg-canvas p-2.5">
          <label className="flex items-center gap-2 text-[11px] text-ink-secondary">
            <input
              type="checkbox"
              name="convertWithoutDeposit"
              value="true"
              className="h-3.5 w-3.5"
            />
            Convert without paid deposit (lands as tentative)
          </label>
          <input
            name="overrideReason"
            placeholder="Override reason (optional)"
            maxLength={500}
            className="h-7 px-2 rounded-md border border-line-soft bg-surface text-[11px]"
          />
        </div>
      )}
    </form>
  );
}

export function CancelHoldButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(
    cancelDirectBookingHoldAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Cancel hold
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}
