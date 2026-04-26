"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  acceptServiceRequestAction,
  completeServiceRequestAction,
} from "@/features/operations/actions";

export function ServiceRequestActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const accept = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await acceptServiceRequestAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };
  const complete = () => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await completeServiceRequestAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex items-center gap-2">
      {status === "new" && (
        <Button size="sm" disabled={pending} onClick={accept}>
          Accept
        </Button>
      )}
      {(status === "accepted" || status === "in_progress") && (
        <Button size="sm" disabled={pending} onClick={complete}>
          Mark completed
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
