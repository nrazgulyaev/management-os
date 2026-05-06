"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import {
  approveOwnerStayRequestAction,
  rejectOwnerStayRequestAction,
  cancelOwnerStayRequestAction,
} from "@/features/owner-stays/actions";
import { findRelocationCandidatesAction } from "@/features/owner-stays/relocation-actions";

const ACTIONABLE = new Set([
  "requested",
  "availability_check",
  "requires_relocation",
  "pending_admin_approval",
]);

export function OwnerStayDecisionBar({
  id,
  status,
}: {
  id: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const dispatch = (
    fn: typeof approveOwnerStayRequestAction,
    extras?: Record<string, string>,
  ) => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", id);
      if (extras) {
        for (const [k, v] of Object.entries(extras)) fd.set(k, v);
      }
      const res = await fn(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  const findRelocations = () => {
    setError(null);
    setInfo(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("ownerStayRequestId", id);
      const res = await findRelocationCandidatesAction(null, fd);
      if (!res.ok) setError(res.error);
      else setInfo(`${res.created ?? 0} candidate(s) discovered.`);
    });
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {error && <span className="text-xs text-danger">{error}</span>}
      {info && !error && <span className="text-xs text-ink-tertiary">{info}</span>}
      {ACTIONABLE.has(status) && (
        <>
          <Button size="sm" variant="secondary" disabled={pending} onClick={findRelocations}>
            Discover relocations
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => dispatch(approveOwnerStayRequestAction, { decision: "approved" })}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => dispatch(rejectOwnerStayRequestAction, { decision: "rejected" })}
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => dispatch(cancelOwnerStayRequestAction)}
          >
            Cancel
          </Button>
        </>
      )}
    </div>
  );
}
