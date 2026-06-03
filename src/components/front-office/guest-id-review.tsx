"use client";

import * as React from "react";
import { useActionState } from "react";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  captureGuestIdAction,
  approveGuestIdAction,
} from "@/features/checkins/id-capture-actions";
import type { GuestIdRecord } from "@/features/checkins/queries";

/**
 * Front-office ID capture + review (Phase 3). When no ID is on file, an upload
 * control runs the id-ocr agent; the extracted fields + confidence then show
 * with a manual-override "Approve ID" when confidence was below threshold.
 */
export function GuestIdReview({
  bookingId,
  idDoc,
}: {
  bookingId: string;
  idDoc?: GuestIdRecord;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState(captureGuestIdAction, null);
  const [approving, startApprove] = React.useTransition();

  React.useEffect(() => {
    if (state?.ok) router.refresh();
  }, [state, router]);

  if (idDoc) {
    return (
      <div className="flex flex-col gap-1 min-w-[170px]">
        <div className="text-xs text-ink">
          {idDoc.fullName ?? "—"}
          {idDoc.nationality ? ` · ${idDoc.nationality}` : ""}
        </div>
        <div className="flex items-center gap-1.5">
          <Badge tone={idDoc.status === "approved" ? "success" : "warning"}>
            {idDoc.status === "approved" ? "ID verified" : "needs review"}
          </Badge>
          <span className="text-[10px] text-ink-tertiary">
            {Math.round(idDoc.confidence * 100)}% · {idDoc.docType}
          </span>
        </div>
        {idDoc.status !== "approved" && (
          <Button
            size="sm"
            variant="secondary"
            disabled={approving}
            onClick={() =>
              startApprove(async () => {
                await approveGuestIdAction(bookingId);
                router.refresh();
              })
            }
          >
            {approving ? "…" : "Approve ID"}
          </Button>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="flex flex-col gap-1 min-w-[170px]">
      <input type="hidden" name="bookingId" value={bookingId} />
      <input type="hidden" name="docType" value="passport" />
      <input
        type="file"
        name="file"
        accept="image/png,image/jpeg,image/webp"
        required
        className="text-[11px] max-w-[160px]"
      />
      {state && !state.ok && <span className="text-[10px] text-danger">{state.error}</span>}
      <Button type="submit" size="sm" variant="secondary" disabled={pending}>
        {pending ? "Scanning…" : "Capture ID"}
      </Button>
    </form>
  );
}
