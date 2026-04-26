"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  approveInventoryCountAction,
  cancelInventoryCountAction,
  submitInventoryCountAction,
} from "@/features/inventory/counts-actions";

export function CountActions({
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

  const run = (action: typeof submitInventoryCountAction) => {
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
        <Button size="sm" disabled={pending} onClick={() => run(submitInventoryCountAction)}>
          Submit count
        </Button>
      )}
      {status === "submitted" && canApprove && (
        <Button
          size="sm"
          variant="primary"
          disabled={pending}
          onClick={() => run(approveInventoryCountAction)}
        >
          Approve & adjust stock
        </Button>
      )}
      {(status === "draft" || status === "submitted") && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => run(cancelInventoryCountAction)}
        >
          Cancel
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
