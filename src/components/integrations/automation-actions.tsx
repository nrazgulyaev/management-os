"use client";

import { useTransition, useState } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  runBookingAutomationActionForBooking,
  runBookingAutomationForRecentBookingsAction,
  seedDefaultBookingAutomationRulesAction,
} from "@/features/booking-automation/actions";

export function RunAutomationButton({ bookingId }: { bookingId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const onClick = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("bookingId", bookingId);
      const res = await runBookingAutomationActionForBooking(null, fd);
      if (!res.ok) setError(res.error);
    });
  };
  return (
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" disabled={pending} onClick={onClick}>
        <Sparkles className="w-3.5 h-3.5" strokeWidth={1.75} />
        Run automation
      </Button>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function RunAutomationForRecentButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      const res = await runBookingAutomationForRecentBookingsAction(null, new FormData());
      if (res.ok) setInfo("Automation re-applied to recent bookings.");
      else setInfo(res.error);
    });
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" disabled={pending} onClick={onClick}>
        <Sparkles className="w-4 h-4" strokeWidth={1.75} />
        Run on recent bookings
      </Button>
      {info && <span className="text-xs text-ink-tertiary">{info}</span>}
    </div>
  );
}

export function SeedDefaultRulesButton() {
  const [pending, startTransition] = useTransition();
  const [info, setInfo] = useState<string | null>(null);
  const onClick = () => {
    setInfo(null);
    startTransition(async () => {
      const res = await seedDefaultBookingAutomationRulesAction(null, new FormData());
      if (res.ok) setInfo("Default rules seeded (if missing).");
      else setInfo(res.error);
    });
  };
  return (
    <div className="flex items-center gap-2">
      <Button variant="secondary" disabled={pending} onClick={onClick}>
        Seed default rules
      </Button>
      {info && <span className="text-xs text-ink-tertiary">{info}</span>}
    </div>
  );
}
