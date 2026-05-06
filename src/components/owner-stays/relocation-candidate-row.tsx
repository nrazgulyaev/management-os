"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  approveRelocationCandidateAction,
  rejectRelocationCandidateAction,
  applyRelocationCandidateAction,
} from "@/features/owner-stays/relocation-actions";

interface CandidateProps {
  candidate: {
    id: string;
    bookingCode: string | null;
    fromVillaCode: string | null;
    toVillaCode: string | null;
    candidateStatus: string;
    score: number;
    guestImpactLevel: string;
    reason: string | null;
    requiresGuestNotification: boolean;
    appliedAt: string | null;
  };
}

const STATUS_TONES: Record<string, "neutral" | "info" | "warning" | "success" | "danger"> = {
  candidate: "info",
  approved: "warning",
  rejected: "neutral",
  applied: "success",
  expired: "neutral",
};

export function RelocationCandidateRow({ candidate }: CandidateProps) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const dispatch = (
    fn:
      | typeof approveRelocationCandidateAction
      | typeof rejectRelocationCandidateAction
      | typeof applyRelocationCandidateAction,
    extras?: Record<string, string>,
  ) => {
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", candidate.id);
      if (extras) for (const [k, v] of Object.entries(extras)) fd.set(k, v);
      const res = await fn(null, fd);
      if (!res.ok) setError(res.error);
    });
  };

  return (
    <li className="p-4 flex items-start justify-between gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge tone={STATUS_TONES[candidate.candidateStatus] ?? "neutral"}>
            {candidate.candidateStatus}
          </Badge>
          <span className="font-mono text-[11px] text-ink-tertiary">
            {candidate.bookingCode ?? candidate.id.slice(0, 8)}
          </span>
          <Badge tone="neutral">impact: {candidate.guestImpactLevel}</Badge>
          <span className="text-[11px] text-ink-tertiary tabular-nums">
            score {candidate.score.toFixed(2)}
          </span>
        </div>
        <div className="text-sm text-ink mt-1.5">
          {candidate.fromVillaCode ?? "—"} → {candidate.toVillaCode ?? "—"}
        </div>
        {candidate.reason && (
          <div className="text-xs text-ink-tertiary mt-0.5">{candidate.reason}</div>
        )}
        {candidate.requiresGuestNotification && (
          <div className="text-[11px] text-ink-tertiary mt-1">
            Requires guest notification before apply.
          </div>
        )}
        {error && <div className="text-xs text-danger mt-2">{error}</div>}
      </div>
      <div className="flex items-center gap-1 shrink-0">
        {candidate.candidateStatus === "candidate" && (
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() =>
                dispatch(approveRelocationCandidateAction, { decision: "approved" })
              }
            >
              Approve
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() =>
                dispatch(rejectRelocationCandidateAction, { decision: "rejected" })
              }
            >
              Reject
            </Button>
          </>
        )}
        {candidate.candidateStatus === "approved" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => dispatch(applyRelocationCandidateAction)}
          >
            Apply
          </Button>
        )}
      </div>
    </li>
  );
}
