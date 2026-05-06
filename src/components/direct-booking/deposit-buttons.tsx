"use client";

import { useActionState } from "react";
import {
  cancelDepositAction,
  createOrRecreateDepositSessionAction,
  markDepositFailedAction,
  markDepositManuallyPaidAction,
  refundDepositPlaceholderAction,
} from "@/features/direct-booking/deposit-actions";

export function CreateOrRecreateSessionButton({
  requestId,
  totalMinor,
  currency,
}: {
  requestId: string;
  totalMinor: string;
  currency: string;
}) {
  const [state, dispatch] = useActionState(
    createOrRecreateDepositSessionAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="requestId" value={requestId} />
      <input type="hidden" name="totalMinor" value={totalMinor} />
      <input type="hidden" name="currency" value={currency} />
      <button
        type="submit"
        className="text-[11px] text-ink hover:underline underline-offset-4"
      >
        Create / recreate session
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function MarkDepositPaidButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(
    markDepositManuallyPaidAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="h-8 px-3 rounded-full bg-success text-ink-inverse text-xs font-medium hover:bg-success/90"
      >
        Mark paid
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function MarkDepositFailedForm({ id }: { id: string }) {
  const [, dispatch] = useActionState(markDepositFailedAction, null);
  return (
    <form action={dispatch} className="flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <input
        name="reason"
        placeholder="reason"
        className="h-8 px-2 rounded-md border border-line-soft bg-canvas text-xs"
      />
      <button
        type="submit"
        className="h-8 px-3 rounded-full border border-line-soft text-xs hover:border-line-strong"
      >
        Mark failed
      </button>
    </form>
  );
}

export function CancelDepositButton({ id }: { id: string }) {
  const [, dispatch] = useActionState(cancelDepositAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Cancel deposit
      </button>
    </form>
  );
}

export function RefundDepositPlaceholderButton({ id }: { id: string }) {
  const [, dispatch] = useActionState(
    refundDepositPlaceholderAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Refund (placeholder)
      </button>
    </form>
  );
}
