"use client";

/**
 * Zone console row controls — one-click lifecycle moves backed by the
 * transitionWorkPackage state machine:
 *
 *   planned → Mark ready → ready_to_start → Start → in_progress
 *   in_progress ⇄ on_hold (Block / Unblock)
 *   in_progress → completed (Mark done, only at 100%)
 *   any non-terminal → cancelled (Cancel — the mock's "delete" analog;
 *   work packages carry FK references from tasks/POs/invoices, so hard
 *   delete is not offered)
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { transitionWorkPackage } from "@/lib/development/server/work-packages/work-package-actions";

type WorkPackageStatus =
  | "planned"
  | "ready_to_start"
  | "in_progress"
  | "completed"
  | "on_hold"
  | "cancelled";

export function ZoneActions({
  workPackageId,
  status,
  progress,
}: {
  workPackageId: string;
  status: string;
  progress: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function transition(to: WorkPackageStatus) {
    setError(null);
    startTransition(async () => {
      try {
        await transitionWorkPackage({ workPackageId, to });
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Transition failed.");
      }
    });
  }

  const canCancel = ["planned", "ready_to_start", "in_progress", "on_hold"].includes(
    status,
  );

  return (
    <div className="zone-actions">
      {status === "planned" && (
        <button
          type="button"
          className="btn btn-dark btn-sm"
          disabled={pending}
          onClick={() => transition("ready_to_start")}
        >
          Mark ready
        </button>
      )}
      {status === "ready_to_start" && (
        <button
          type="button"
          className="btn btn-amber btn-sm"
          disabled={pending}
          onClick={() => transition("in_progress")}
        >
          Start
        </button>
      )}
      {status === "in_progress" && (
        <button
          type="button"
          className="btn btn-dark btn-sm"
          disabled={pending}
          onClick={() => transition("on_hold")}
        >
          Block
        </button>
      )}
      {status === "in_progress" && progress >= 100 && (
        <button
          type="button"
          className="btn btn-amber btn-sm"
          disabled={pending}
          onClick={() => transition("completed")}
        >
          Mark done
        </button>
      )}
      {status === "on_hold" && (
        <button
          type="button"
          className="btn btn-amber btn-sm"
          disabled={pending}
          onClick={() => transition("in_progress")}
        >
          Unblock
        </button>
      )}
      {canCancel && (
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={pending}
          onClick={() => {
            if (window.confirm("Cancel this work zone? It stays in the catalog as cancelled.")) {
              transition("cancelled");
            }
          }}
        >
          Cancel
        </button>
      )}
      {error && (
        <p className="zone-actions-error mono" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
