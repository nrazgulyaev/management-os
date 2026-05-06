"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  resolveConflictByConfirmingNew,
  resolveConflictByRejectingNew,
} from "@/lib/channel-manager/service";

/**
 * Stage 6.P1.F.2 — Conflict resolution actions.
 *
 * Two operator choices per conflict:
 *   - Confirm new → cancel the existing booking, project the new one
 *   - Reject new → mark the new reservation cancelled, leave existing
 *
 * "Move villa" (third option in the launch prompt) requires a villa
 * picker — deferred to a follow-up because the proper UX needs an
 * availability check across alternative villas. Documented in the
 * P1.F report's carry-forward.
 */

export function ConflictResolutionActions({
  channelReservationId,
  externalReservationId,
}: {
  channelReservationId: string;
  externalReservationId: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingConfirm, setConfirmingConfirm] = useState(false);
  const [confirmingReject, setConfirmingReject] = useState(false);

  function confirmNew() {
    if (!confirmingConfirm) {
      setConfirmingConfirm(true);
      setConfirmingReject(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resolveConflictByConfirmingNew(channelReservationId);
      if (!result.ok) {
        setError(result.error ?? "Resolution failed");
      } else {
        router.refresh();
      }
      setConfirmingConfirm(false);
    });
  }

  function rejectNew() {
    if (!confirmingReject) {
      setConfirmingReject(true);
      setConfirmingConfirm(false);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await resolveConflictByRejectingNew(channelReservationId);
      if (!result.ok) {
        setError(result.error ?? "Resolution failed");
      } else {
        router.refresh();
      }
      setConfirmingReject(false);
    });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          onClick={confirmNew}
          disabled={pending}
          data-testid={`conflict-confirm-${channelReservationId}`}
        >
          {pending && confirmingConfirm ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Check className="w-3 h-3" />
          )}
          <span className="ml-1">
            {confirmingConfirm ? "Confirm: cancel existing" : "Confirm new"}
          </span>
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={rejectNew}
          disabled={pending}
          data-testid={`conflict-reject-${channelReservationId}`}
        >
          {pending && confirmingReject ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <X className="w-3 h-3" />
          )}
          <span className="ml-1">
            {confirmingReject ? "Confirm: reject new" : "Reject new"}
          </span>
        </Button>
        {(confirmingConfirm || confirmingReject) && (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setConfirmingConfirm(false);
              setConfirmingReject(false);
            }}
          >
            Cancel
          </Button>
        )}
      </div>
      {error && (
        <p
          className="text-xs text-danger"
          data-testid={`conflict-error-${channelReservationId}`}
        >
          {error}
        </p>
      )}
      <p className="text-[11px] text-ink-tertiary">
        External ID: {externalReservationId}
      </p>
    </div>
  );
}
