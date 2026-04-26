"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  approvePurchaseRequestAction,
  cancelPurchaseRequestAction,
  createPurchaseOrderFromRequestAction,
  rejectPurchaseRequestAction,
  submitPurchaseRequestAction,
} from "@/features/procurement/actions";

export function RequestActions({
  id,
  status,
  canApprove,
}: {
  id: string;
  status: string;
  canApprove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (
    action: typeof submitPurchaseRequestAction,
  ) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === "draft" && (
        <Button size="sm" disabled={pending} onClick={() => run(submitPurchaseRequestAction)}>
          Submit for approval
        </Button>
      )}
      {status === "submitted" && canApprove && (
        <>
          <Button size="sm" disabled={pending} onClick={() => run(approvePurchaseRequestAction)}>
            Approve
          </Button>
          <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(rejectPurchaseRequestAction)}>
            Reject
          </Button>
        </>
      )}
      {status === "approved" && (
        <Button size="sm" disabled={pending} onClick={() => run(createPurchaseOrderFromRequestAction)}>
          Create PO
        </Button>
      )}
      {!["ordered", "cancelled", "rejected"].includes(status) && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(cancelPurchaseRequestAction)}>
          Cancel request
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
