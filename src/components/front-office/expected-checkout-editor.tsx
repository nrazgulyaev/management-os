"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { updateExpectedCheckoutTimeAction } from "@/features/front-office/actions";
import type { ActionResult } from "@/features/projects/actions";

/**
 * Inline editor for a departure's expected-checkout time. Backed by
 * `updateExpectedCheckoutTimeAction` (perm `front_office.write`, org-scoped) —
 * the action re-validates the booking belongs to the caller's org and appends a
 * `expected_checkout_updated` stay event. Submits `{ bookingId,
 * expectedCheckoutAt }`; field names mirror `expectedCheckoutTimeSchema`.
 *
 * Same shape as `payout-line-status-buttons.tsx`: useActionState +
 * router.refresh() on success.
 */
export function ExpectedCheckoutEditor({
  bookingId,
  expectedCheckoutAt,
}: {
  bookingId: string;
  /** Current value as an ISO string, or null when unset. */
  expectedCheckoutAt: string | null;
}) {
  const [state, dispatch, pending] = useActionState<ActionResult | null, FormData>(
    updateExpectedCheckoutTimeAction,
    null,
  );
  const router = useRouter();
  const [editing, setEditing] = useState(false);

  useEffect(() => {
    if (state?.ok) {
      setEditing(false);
      router.refresh();
    }
  }, [state, router]);

  // `datetime-local` wants "YYYY-MM-DDTHH:mm". Trim the ISO string to fit.
  const inputDefault = expectedCheckoutAt ? expectedCheckoutAt.slice(0, 16) : "";
  const display = expectedCheckoutAt
    ? expectedCheckoutAt.slice(0, 16).replace("T", " ")
    : "—";

  if (!editing) {
    return (
      <div className="flex items-center gap-2 justify-end">
        <span className="num text-ink-3">{display}</span>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn btn-sm btn-ghost"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <form action={dispatch} className="flex items-center gap-1.5 justify-end">
      <input type="hidden" name="bookingId" value={bookingId} />
      {state && !state.ok && state.error && (
        <span className="text-[11px] text-danger mr-1">{state.error}</span>
      )}
      <input
        type="datetime-local"
        name="expectedCheckoutAt"
        required
        defaultValue={inputDefault}
        className="h-8 px-2 rounded-sm border border-line-soft bg-canvas text-xs text-ink focus:outline-none focus:border-line-strong"
      />
      <button type="submit" disabled={pending} className="btn btn-sm btn-primary">
        {pending ? "Saving…" : "Save"}
      </button>
      <button
        type="button"
        onClick={() => setEditing(false)}
        disabled={pending}
        className="btn btn-sm btn-ghost"
      >
        Cancel
      </button>
    </form>
  );
}
