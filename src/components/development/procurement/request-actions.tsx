"use client";

/**
 * Stage 7.F.A.3 — Dev OS purchase-request approve / reject actions.
 *
 * Wraps `transitionPurchaseRequest` (server action) with Approve / Reject /
 * Cancel buttons. Threshold check happens server-side; UI only gates
 * visibility based on the current status. Reject requires a reason.
 */

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { transitionPurchaseRequest } from "@/lib/development/server/procurement/procurement-actions";

export function DevOsPurchaseRequestActions({
  requestId,
  status,
  canApprove,
}: {
  requestId: string;
  status: string;
  canApprove: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const transition = (
    newStatus:
      | "submitted"
      | "approved"
      | "quotations_in_progress"
      | "rejected"
      | "cancelled",
    rejectionReason?: string,
  ) => {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        await transitionPurchaseRequest({
          requestId,
          newStatus,
          rejectionReason,
        });
        setSuccess(`Marked ${newStatus}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    });
  };

  const handleReject = () => {
    const reason = window.prompt(
      "Reason for rejection (required, min 3 chars):",
    );
    if (!reason || reason.trim().length < 3) {
      setError("Rejection reason is required (min 3 characters).");
      return;
    }
    transition("rejected", reason.trim());
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {status === "draft" && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => transition("submitted")}
        >
          Submit for approval
        </Button>
      )}
      {status === "submitted" && canApprove && (
        <>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => {
              if (
                confirm(
                  "Approve this purchase request? Threshold rules will re-check on the server.",
                )
              ) {
                transition("approved");
              }
            }}
          >
            Approve
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={handleReject}
          >
            Reject
          </Button>
        </>
      )}
      {status === "approved" && (
        <Button
          size="sm"
          disabled={pending}
          onClick={() => transition("quotations_in_progress")}
        >
          Open for quotations
        </Button>
      )}
      {!["po_created", "cancelled", "rejected"].includes(status) && (
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() => {
            if (confirm("Cancel this purchase request?")) {
              transition("cancelled");
            }
          }}
        >
          Cancel
        </Button>
      )}
      {error && <span className="text-xs text-red-600 ml-2">{error}</span>}
      {success && (
        <span className="text-xs text-emerald-700 ml-2">{success}</span>
      )}
    </div>
  );
}
