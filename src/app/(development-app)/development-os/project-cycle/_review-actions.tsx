"use client";

/**
 * Wire-up sweep — accept/reject a project-cycle recommendation.
 * The recommendations table was read-only; reviewCycleRecommendation
 * existed but had no UI caller.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { reviewCycleRecommendationAction } from "./_actions";

export function CycleReviewActions({
  recommendationId,
  currentStatus,
}: {
  recommendationId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  if (currentStatus !== "unreviewed") {
    return <span className="text-xs text-ink-tertiary">—</span>;
  }

  function decide(decision: "accepted" | "rejected") {
    setErr(null);
    start(async () => {
      const r = await reviewCycleRecommendationAction({
        recommendationId,
        decision,
      });
      if (!r.ok) {
        setErr(r.error ?? "Failed.");
        return;
      }
      router.refresh();
    });
  }

  const btn =
    "text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50";
  const dangerBtn =
    "text-xs px-2 py-1 rounded border border-danger/40 bg-surface text-danger hover:bg-danger/5 disabled:opacity-50";

  return (
    <div className="flex items-center gap-1.5">
      <button type="button" className={btn} disabled={pending} onClick={() => decide("accepted")}>
        Accept
      </button>
      <button type="button" className={dangerBtn} disabled={pending} onClick={() => decide("rejected")}>
        Reject
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </div>
  );
}
