"use client";

import { useActionState } from "react";
import {
  expireDepositNowAction,
  postDirectBookingRevenueAction,
  reconcilePendingDirectBookingsAction,
  reverseDirectBookingFinanceLinkAction,
} from "@/features/direct-booking/reconcile-actions";

export function PostRevenueButton({ requestId }: { requestId: string }) {
  const [state, dispatch] = useActionState(
    postDirectBookingRevenueAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <button
        type="submit"
        className="h-8 px-3 rounded-full bg-success text-ink-inverse text-xs font-medium hover:bg-success/90"
      >
        Post revenue
      </button>
      {state?.ok && state.status && (
        <span className="text-xs text-success">{state.status}</span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function ReverseLinkForm({ id }: { id: string }) {
  const [state, dispatch] = useActionState(
    reverseDirectBookingFinanceLinkAction,
    null,
  );
  return (
    <form action={dispatch} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="reason"
        placeholder="reason"
        required
        className="h-8 px-2 rounded-md border border-line-soft bg-canvas text-xs"
      />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Reverse
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function ReconcilePendingButton() {
  const [state, dispatch] = useActionState(
    reconcilePendingDirectBookingsAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Reconcile pending
      </button>
      {state?.ok && (
        <span className="text-xs text-success">
          posted {state.posted ?? 0} · skipped {state.skipped ?? 0} ·
          failed {state.failed ?? 0}
        </span>
      )}
    </form>
  );
}

export function ExpireDepositNowButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(expireDepositNowAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Expire now
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}
