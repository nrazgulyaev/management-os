"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle, X, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  reviewInvestorPortalRequest,
  executeInvestorPortalRequest,
} from "@/lib/development/server/investor-portal-requests/request-actions";

/**
 * Operator-side: review / approve / reject / execute an investor request.
 * Execution is a separate explicit click after approval — there is no
 * auto-execute path. The server action atomically writes the
 * wallet_movement and links it back to the request.
 */
export function RequestReviewActions({
  requestId,
  status,
}: {
  requestId: string;
  status: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [reason, setReason] = useState("");

  function review(decision: "under_review" | "approved" | "rejected") {
    setError(null);
    startTransition(async () => {
      try {
        const out = await reviewInvestorPortalRequest({
          requestId,
          decision,
          approvalNotes: decision === "approved" ? reason : null,
          rejectionReason: decision === "rejected" ? reason : null,
        });
        setResult(`Status now: ${out.status}.`);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Review failed");
      }
    });
  }

  function execute() {
    setError(null);
    startTransition(async () => {
      try {
        const out = await executeInvestorPortalRequest({ requestId });
        setResult(
          `Executed. Created wallet_movement ${out.movement.id.slice(0, 8)}.`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Execute failed");
      }
    });
  }

  const canReview = status === "submitted" || status === "under_review";
  const canExecute = status === "approved";

  return (
    <div className="space-y-3">
      {(canReview || canExecute) && (
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={canExecute ? "Execution notes (optional)" : "Approval notes / rejection reason"}
          rows={2}
          className="w-full rounded border border-line-soft p-2 text-sm"
        />
      )}
      <div className="flex flex-wrap gap-2">
        {status === "submitted" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => review("under_review")}
          >
            {pending && <Loader2 className="w-3 h-3 animate-spin mr-1" />}
            Mark under review
          </Button>
        )}
        {canReview && (
          <Button size="sm" disabled={pending} onClick={() => review("approved")}>
            {pending ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <CheckCircle className="w-3 h-3 mr-1" />
            )}
            Approve
          </Button>
        )}
        {canReview && (
          <Button
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => review("rejected")}
          >
            <X className="w-3 h-3 mr-1" />
            Reject
          </Button>
        )}
        {canExecute && (
          <Button size="sm" disabled={pending} onClick={execute}>
            {pending ? (
              <Loader2 className="w-3 h-3 animate-spin mr-1" />
            ) : (
              <Play className="w-3 h-3 mr-1" />
            )}
            Execute (atomic wallet movement)
          </Button>
        )}
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {result && <p className="text-xs text-success">{result}</p>}
    </div>
  );
}
