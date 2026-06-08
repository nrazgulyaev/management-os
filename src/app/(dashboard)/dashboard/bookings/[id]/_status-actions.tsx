"use client";

/**
 * Wave A — booking status-FSM action buttons on the booking detail header.
 *
 * Mounts the already-built (and front-office-proven) setBookingStatusAction
 * so a reservist can advance a booking through its lifecycle from the detail
 * page instead of only the legacy edit form. The visible buttons are gated by
 * the current status (client-side FSM); the action itself is permission-gated
 * (canManageEntity("booking")) and audit-logged server-side.
 *
 * Follows the same confirm-prompt + useTransition pattern as the front-office
 * CheckInButton/CheckOutButton (src/components/front-office/check-in-out-buttons.tsx).
 *
 * Note: setBookingStatusAction does not yet enforce the transition map
 * server-side (it accepts any valid status enum); the gating here is the
 * UI guard. Server-side FSM enforcement is a follow-up hardening item.
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setBookingStatusAction } from "@/features/bookings/actions";

interface Transition {
  to: string;
  label: string;
  confirm: string;
  primary?: boolean;
}

const TRANSITIONS: Record<string, Transition[]> = {
  inquiry: [
    { to: "confirmed", label: "Confirm", confirm: "Confirm this booking?", primary: true },
    { to: "cancelled", label: "Cancel", confirm: "Cancel this booking?" },
  ],
  tentative: [
    { to: "confirmed", label: "Confirm", confirm: "Confirm this booking?", primary: true },
    { to: "cancelled", label: "Cancel", confirm: "Cancel this booking?" },
  ],
  confirmed: [
    { to: "checked_in", label: "Check in", confirm: "Mark this booking as checked in?", primary: true },
    { to: "no_show", label: "Mark no-show", confirm: "Mark this booking as a no-show?" },
    { to: "cancelled", label: "Cancel", confirm: "Cancel this booking?" },
  ],
  checked_in: [
    { to: "checked_out", label: "Check out", confirm: "Mark this booking as checked out?", primary: true },
  ],
};

export function BookingStatusActions({
  bookingId,
  status,
}: {
  bookingId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const transitions = TRANSITIONS[status] ?? [];
  if (transitions.length === 0) return null;

  function run(to: string, confirmMsg: string) {
    if (!confirm(confirmMsg)) return;
    setError(null);
    const fd = new FormData();
    fd.set("id", bookingId);
    fd.set("status", to);
    startTransition(async () => {
      const res = await setBookingStatusAction(null, fd);
      if (!res.ok) {
        setError(res.error ?? "Failed to update status.");
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      {transitions.map((t) => (
        <button
          key={t.to}
          type="button"
          disabled={pending}
          onClick={() => run(t.to, t.confirm)}
          className={`btn ${t.primary ? "btn-accent" : "btn-secondary"} btn-sm disabled:opacity-50`}
        >
          {pending ? "…" : t.label}
        </button>
      ))}
      {error && <span className="text-xs text-danger">{error}</span>}
    </>
  );
}
