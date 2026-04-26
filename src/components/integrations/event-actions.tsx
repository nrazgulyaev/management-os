"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  ignoreCalendarEventAction,
  materialiseCalendarEventAction,
} from "@/features/integrations/calendar-sync/actions";

export function EventActions({ id, hasBooking }: { id: string; hasBooking: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: typeof materialiseCalendarEventAction) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  if (hasBooking) {
    return <span className="text-[11px] text-ink-tertiary">Linked to booking</span>;
  }

  return (
    <div className="flex items-center gap-1">
      <Button size="sm" disabled={pending} onClick={() => run(materialiseCalendarEventAction)}>
        Create booking
      </Button>
      <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(ignoreCalendarEventAction)}>
        Ignore
      </Button>
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
