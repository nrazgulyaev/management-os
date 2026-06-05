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
    <>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="Add a note — arrival timing, special requests…"
        className="w-full -mx-2 resize-none rounded px-2 py-1 text-sm leading-relaxed text-ink bg-transparent hover:bg-muted/30 focus:bg-surface focus:outline-none focus:ring-1 focus:ring-line-strong transition-colors"
      />

      {dirty && (
        <div className="fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 items-center gap-4 rounded-full border border-line-soft bg-surface px-5 py-2.5 shadow-elevated-card">
          <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-terra">
            1 unsaved edit · notes
          </span>
          {error && <span className="text-[11px] text-danger">{error}</span>}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setValue(baseline);
                setError(null);
              }}
              disabled={pending}
            >
              Discard
            </button>
            <button
              type="button"
              className="btn btn-accent btn-sm"
              onClick={save}
              disabled={pending}
            >
              {pending ? "Saving…" : "Save changes"}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
