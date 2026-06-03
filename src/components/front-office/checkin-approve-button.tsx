"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { approveStayCheckinAction } from "@/features/checkins/mgmt-actions";

/**
 * Front office: approve a submitted online check-in. Issues the door code,
 * flips the booking to checked_in, and (the guest then sees the code).
 */
export function CheckinApproveButton({
  bookingId,
  disabled,
  disabledReason,
}: {
  bookingId: string;
  disabled?: boolean;
  disabledReason?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  return (
    <div className="flex flex-col gap-1">
      <Button
        size="sm"
        disabled={pending || disabled}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const res = await approveStayCheckinAction(bookingId);
            if (!res.ok) {
              setError(res.error ?? "Could not approve.");
              return;
            }
            router.refresh();
          })
        }
      >
        {pending ? "Approving…" : "Approve & issue code"}
      </Button>
      {error && <span className="text-[11px] text-danger">{error}</span>}
      {!error && disabled && disabledReason && (
        <span className="text-[11px] text-ink-tertiary">Not ready · {disabledReason}</span>
      )}
    </div>
  );
}
