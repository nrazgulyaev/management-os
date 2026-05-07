"use client";

/**
 * Stage 7.F.A.1 — Front Office check-in / check-out action buttons.
 *
 * The audit found these buttons missing on /front-office/arrivals and
 * /front-office/departures, leaving the operator unable to mark
 * milestones from the UI. Both delegate to the existing
 * `setBookingStatusAction` (no new server action needed).
 *
 * Visibility rule:
 *   - Check-in button shows only when bookingStatus === 'confirmed'.
 *   - Check-out button shows only when bookingStatus === 'checked_in'.
 *
 * On click → confirm prompt → submit form → revalidate.
 */

import { useState, useTransition } from "react";
import { setBookingStatusAction } from "@/features/bookings/actions";

interface ButtonProps {
  bookingId: string;
  bookingStatus: string;
}

export function CheckInButton({ bookingId, bookingStatus }: ButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (bookingStatus !== "confirmed") return null;

  return (
    <form
      action={(formData: FormData) => {
        if (!confirm("Mark this booking as checked in?")) return;
        formData.set("id", bookingId);
        formData.set("status", "checked_in");
        startTransition(async () => {
          const result = await setBookingStatusAction(null, formData);
          if (!result.ok) {
            setError(result.error ?? "Failed to update");
          }
        });
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-xs px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-50"
      >
        {pending ? "..." : "Check in"}
      </button>
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </form>
  );
}

export function CheckOutButton({ bookingId, bookingStatus }: ButtonProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (bookingStatus !== "checked_in") return null;

  return (
    <form
      action={(formData: FormData) => {
        if (!confirm("Mark this booking as checked out?")) return;
        formData.set("id", bookingId);
        formData.set("status", "checked_out");
        startTransition(async () => {
          const result = await setBookingStatusAction(null, formData);
          if (!result.ok) {
            setError(result.error ?? "Failed to update");
          }
        });
      }}
    >
      <button
        type="submit"
        disabled={pending}
        className="text-xs px-2 py-1 rounded border border-stone-300 bg-white hover:bg-stone-50 disabled:opacity-50"
      >
        {pending ? "..." : "Check out"}
      </button>
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
    </form>
  );
}
