"use client";

/**
 * VIP toggle for a guest row. Flips guests.is_vip via the tenancy-scoped
 * setGuestVipAction (only guests with a booking in the caller's org can be
 * toggled). Optimistic; reverts on error. The flag drives the front-office
 * vip-prep monitor.
 */

import * as React from "react";
import { useTransition } from "react";
import { Star } from "lucide-react";
import { setGuestVipAction } from "@/features/guests/actions";

export function VipToggle({
  guestId,
  initial,
}: {
  guestId: string;
  initial: boolean;
}) {
  const [isVip, setIsVip] = React.useState(initial);
  const [pending, startTransition] = useTransition();

  function toggle() {
    const next = !isVip;
    setIsVip(next);
    startTransition(async () => {
      const res = await setGuestVipAction({ id: guestId, isVip: next });
      if (!res.ok) setIsVip(!next);
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-pressed={isVip}
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors ${
        isVip
          ? "border-amber-300 bg-amber-50 text-amber-700"
          : "border-line-soft text-ink-tertiary hover:text-ink"
      } disabled:opacity-50`}
    >
      <Star className="size-3.5" fill={isVip ? "currentColor" : "none"} strokeWidth={1.75} />
      {isVip ? "VIP" : "Mark VIP"}
    </button>
  );
}
