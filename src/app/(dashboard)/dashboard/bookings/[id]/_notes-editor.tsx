"use client";

/**
 * Booking notes — inline editable field + sticky "unsaved edit" bar.
 * Drives `updateBookingNotesAction`; on save the audit trail records a
 * `booking.update`, which surfaces on the Activity tab.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { updateBookingNotesAction } from "@/features/bookings/detail-actions";

export function BookingNotesEditor({
  bookingId,
  initial,
}: {
  bookingId: string;
  initial: string;
}) {
  const router = useRouter();
  const [value, setValue] = React.useState(initial);
  const [baseline, setBaseline] = React.useState(initial);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const dirty = value !== baseline;

  // Keep baseline in sync if the server value changes underneath us.
  React.useEffect(() => {
    setValue(initial);
    setBaseline(initial);
  }, [initial]);

  function save() {
    setError(null);
    start(async () => {
      const res = await updateBookingNotesAction(bookingId, value);
      if (res.ok) {
        setBaseline(value);
        router.refresh();
      } else {
        setError(res.error ?? "Save failed");
      }
    });
  }

  return (
    <div className="flex flex-col gap-2 w-full">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Add a note — arrival timing, special requests…"
        className="w-full resize-none rounded-md border border-line-soft px-3 py-2 text-sm leading-relaxed text-ink bg-surface hover:border-line-strong focus:outline-none focus:ring-1 focus:ring-terra transition-colors"
      />

      {(dirty || error) && (
        <div className="flex items-center gap-3">
          {dirty && (
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-terra">
              Unsaved
            </span>
          )}
          {error && <span className="text-[11px] text-danger">{error}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setValue(baseline);
                setError(null);
              }}
              disabled={pending || !dirty}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn-accent btn-sm"
              onClick={save}
              disabled={pending || !dirty}
            >
              {pending ? "Saving…" : "Save note"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
