"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  acknowledgeBookingConflictAction,
  resolveBookingConflictAction,
} from "@/features/integrations/calendar-sync/actions";

export function ConflictActions({ id, status }: { id: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (action: typeof resolveBookingConflictAction) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  if (status === "resolved" || status === "ignored") return null;
  return (
    <div className="flex items-center gap-1">
      {status === "open" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(acknowledgeBookingConflictAction)}
        >
          Acknowledge
        </Button>
      )}
      <Button size="sm" disabled={pending} onClick={() => run(resolveBookingConflictAction)}>
        Resolve
      </Button>
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
