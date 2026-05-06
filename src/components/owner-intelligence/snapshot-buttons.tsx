"use client";

import { useActionState } from "react";
import {
  generateAllOwnerHealthSnapshotsAction,
  generateVillaHealthSnapshotAction,
  hideGuestReviewAction,
  markGuestReviewOwnerVisibleAction,
  refreshOwnerVisibleEventsAction,
} from "@/features/owner-intelligence/actions";

export function GenerateAllSnapshotsButton() {
  const [state, dispatch] = useActionState(
    generateAllOwnerHealthSnapshotsAction,
    null,
  );
  return (
    <form action={dispatch} className="flex items-center gap-3">
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Generate this month&apos;s snapshots
      </button>
      {state?.ok && (
        <span className="text-xs text-success">
          Generated {state.generated ?? 0} snapshot
          {state.generated === 1 ? "" : "s"}.
        </span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function GenerateVillaSnapshotForm({
  villaId,
  periodStart,
  periodEnd,
}: {
  villaId: string;
  periodStart: string;
  periodEnd: string;
}) {
  const [state, dispatch] = useActionState(
    generateVillaHealthSnapshotAction,
    null,
  );
  return (
    <form action={dispatch} className="flex items-center gap-3">
      <input type="hidden" name="villaId" value={villaId} />
      <input type="hidden" name="periodStart" value={periodStart} />
      <input type="hidden" name="periodEnd" value={periodEnd} />
      <button
        type="submit"
        className="h-9 px-4 rounded-full border border-line-soft text-xs hover:border-line-strong"
      >
        Recompute snapshot
      </button>
      {state?.ok && <span className="text-xs text-success">Saved.</span>}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function HideReviewButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(hideGuestReviewAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-ink underline-offset-4 hover:underline"
      >
        Hide
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function PublishReviewButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(
    markGuestReviewOwnerVisibleAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink hover:underline underline-offset-4"
      >
        Make owner-visible
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function RefreshOwnerEventsButton() {
  const [state, dispatch] = useActionState(
    refreshOwnerVisibleEventsAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <button
        type="submit"
        className="h-9 px-4 rounded-full border border-line-soft text-xs hover:border-line-strong"
      >
        Refresh owner events
      </button>
      {state?.ok && (
        <span className="text-xs text-success">Audit logged.</span>
      )}
    </form>
  );
}
