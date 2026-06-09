"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { cancelMyInvestorPortalRequest } from "@/lib/development/server/investor-portal-requests/request-actions";
import { Button } from "@/components/ui/button";

/**
 * LP-side "withdraw this request" affordance. Only rendered for requests
 * the investor may still cancel (submitted / under_review). Two-step
 * confirm so a mis-click doesn't kill an in-flight request.
 */
export function CancelRequestButton({ requestId }: { requestId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function cancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelMyInvestorPortalRequest({ requestId });
      if (res.ok) {
        router.refresh();
      } else {
        setError(res.error);
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setConfirming(true)}
      >
        Cancel
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <div className="flex items-center gap-1">
        <Button
          type="button"
          variant="destructive"
          size="sm"
          onClick={cancel}
          disabled={pending}
        >
          {pending ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <X className="w-3.5 h-3.5" />
          )}
          Confirm cancel
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={pending}
        >
          Keep
        </Button>
      </div>
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  );
}
