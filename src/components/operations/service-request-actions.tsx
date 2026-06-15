"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  acceptServiceRequestAction,
  cancelServiceRequestAction,
  completeServiceRequestAction,
} from "@/features/operations/actions";
import type { ActionResult } from "@/features/projects/actions";

export function ServiceRequestActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (
    action: (prev: ActionResult | null, fd: FormData) => Promise<ActionResult>,
  ) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action(null, fd);
      if (!res.ok) setError(res.error ?? "Could not update the request.");
    });
  };

  const isTerminal = status === "completed" || status === "cancelled";

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === "new" && (
        <Button size="sm" disabled={pending} onClick={() => run(acceptServiceRequestAction)}>
          Accept
        </Button>
      )}
      {(status === "accepted" || status === "in_progress") && (
        <Button size="sm" disabled={pending} onClick={() => run(completeServiceRequestAction)}>
          Mark completed
        </Button>
      )}
      {!isTerminal && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(cancelServiceRequestAction)}
        >
          Cancel
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
