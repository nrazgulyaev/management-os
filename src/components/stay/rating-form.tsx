"use client";

import { useActionState, useState } from "react";
import {
  guestConfirmFulfilmentAction,
  submitGuestServiceRatingAction,
} from "@/features/service-fulfilment/actions";

export function GuestServiceRatingForm({
  fulfilmentId,
  stayTokenId,
}: {
  fulfilmentId: string;
  stayTokenId: string;
}) {
  const [state, dispatch] = useActionState(
    submitGuestServiceRatingAction,
    null,
  );
  const [rating, setRating] = useState(5);
  return (
    <form action={dispatch} className="flex flex-col gap-3">
      <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
      <input type="hidden" name="stayTokenId" value={stayTokenId} />
      <input type="hidden" name="rating" value={rating} />
      <div className="flex items-center gap-2 text-2xl">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => setRating(n)}
            className={n <= rating ? "text-warning" : "text-line-soft"}
          >
            ★
          </button>
        ))}
      </div>
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Comment (optional)
        <textarea
          name="comment"
          rows={3}
          className="px-3 py-2 rounded-md border border-line-soft bg-canvas text-sm text-ink"
        />
      </label>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Submit rating
        </button>
        {state?.ok && (
          <span className="text-xs text-success">Thanks!</span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

export function GuestConfirmFulfilmentButton({
  fulfilmentId,
  stayTokenId,
}: {
  fulfilmentId: string;
  stayTokenId: string;
}) {
  const [state, dispatch] = useActionState(
    guestConfirmFulfilmentAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={fulfilmentId} />
      <input type="hidden" name="stayTokenId" value={stayTokenId} />
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Confirm timing
      </button>
      {state?.ok && (
        <span className="text-xs text-success">Confirmed.</span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}
