"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  bridgeOwnerStayRequestAction,
  completeOwnerStayRequestAction,
  reverseOwnerStayFinanceBridgeAction,
} from "@/features/owner-stays/finance-bridge-actions";

interface Props {
  id: string;
  status: string;
  financeBridgeStatus: string;
}

const COMPLETABLE = new Set(["approved"]);
const BRIDGEABLE = new Set(["approved", "completed"]);

export function OwnerStayLifecycleBar({ id, status, financeBridgeStatus }: Props) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const dispatch = (
    fn:
      | typeof completeOwnerStayRequestAction
      | typeof bridgeOwnerStayRequestAction
      | typeof reverseOwnerStayFinanceBridgeAction,
    extras?: Record<string, string>,
  ) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      if (extras) for (const [k, v] of Object.entries(extras)) fd.set(k, v);
      const res = await fn(null, fd);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Best-effort feedback — actions revalidatePath, page will refresh.
      setInfo("Done.");
    });
  };

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex items-center gap-1 flex-wrap">
        {COMPLETABLE.has(status) && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => dispatch(completeOwnerStayRequestAction)}
          >
            Mark completed
          </Button>
        )}
        {BRIDGEABLE.has(status) &&
          financeBridgeStatus !== "bridged" && (
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => dispatch(bridgeOwnerStayRequestAction)}
            >
              Bridge to finance
            </Button>
          )}
        {financeBridgeStatus === "bridged" && (
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() =>
              dispatch(reverseOwnerStayFinanceBridgeAction, {
                reason: "manual reverse from request detail",
              })
            }
          >
            Reverse bridge
          </Button>
        )}
      </div>
      {error && <span className="text-xs text-danger">{error}</span>}
      {info && !error && <span className="text-xs text-ink-tertiary">{info}</span>}
    </div>
  );
}
