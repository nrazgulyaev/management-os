"use client";

import { useTransition, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  cancelPurchaseOrderAction,
  confirmPurchaseOrderAction,
  markPurchaseOrderReceivedAction,
  sendPurchaseOrderAction,
} from "@/features/procurement/actions";

const TERMINAL = ["received", "cancelled"];

export function OrderActions({
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

  const run = (action: typeof sendPurchaseOrderAction) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      const res = await action(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  const isTerminal = TERMINAL.includes(status);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === "draft" && (
        <Button size="sm" disabled={pending} onClick={() => run(sendPurchaseOrderAction)}>
          Send to vendor
        </Button>
      )}
      {status === "sent" && (
        <Button size="sm" disabled={pending} onClick={() => run(confirmPurchaseOrderAction)}>
          Confirm
        </Button>
      )}
      {!isTerminal && canApprove && (
        <Button size="sm" disabled={pending} onClick={() => run(markPurchaseOrderReceivedAction)}>
          Mark received
        </Button>
      )}
      {!isTerminal && (
        <Button size="sm" variant="ghost" disabled={pending} onClick={() => run(cancelPurchaseOrderAction)}>
          Cancel PO
        </Button>
      )}
      {error && <span className="text-xs text-danger ml-2">{error}</span>}
    </div>
  );
}
