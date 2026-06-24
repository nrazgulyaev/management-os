"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  acknowledgeRiskEventAction,
  resolveRiskEventAction,
} from "@/features/maintenance-intelligence/actions";

export function RiskRowActions({
  id,
  status,
}: {
  id: string;
  // The risk lifecycle is open → acknowledged → resolved. We render only the
  // valid next transitions for the current status so an acknowledged risk is no
  // longer a dead-end: Acknowledge is shown for "open" only; Resolve is shown
  // for both "open" and "acknowledged". (Typed as the row's `status: string`.)
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const dispatch = (
    fn: typeof acknowledgeRiskEventAction | typeof resolveRiskEventAction,
  ) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await fn(null, fd);
      if (!res.ok) setError(res.error);
    });
  };
  return (
    <div className="flex items-center gap-1 shrink-0">
      {error && <span className="text-xs text-danger">{error}</span>}
      {status === "open" && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => dispatch(acknowledgeRiskEventAction)}
        >
          Acknowledge
        </Button>
      )}
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() => dispatch(resolveRiskEventAction)}
      >
        Resolve
      </Button>
    </div>
  );
}
