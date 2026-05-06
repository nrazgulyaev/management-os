"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import { reviewCheckinCheckoutRequestAction } from "@/features/front-office/actions";
import { canTransitionRequestStatus } from "@/features/front-office/transitions";

export function CheckinCheckoutRequestRowActions({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const review = (decision: "approved" | "rejected" | "completed" | "cancelled") => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      fd.set("decision", decision);
      const res = await reviewCheckinCheckoutRequestAction(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  const can = (d: string) => canTransitionRequestStatus(status, d);

  return (
    <div className="flex items-center gap-1 justify-end">
      {can("approved") && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => review("approved")}>
          Approve
        </Button>
      )}
      {can("rejected") && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => review("rejected")}>
          Reject
        </Button>
      )}
      {can("completed") && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => review("completed")}>
          Complete
        </Button>
      )}
      {can("cancelled") && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => review("cancelled")}>
          Cancel
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
