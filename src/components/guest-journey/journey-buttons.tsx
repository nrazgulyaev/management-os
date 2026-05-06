"use client";

import { useActionState } from "react";
import {
  archiveGuestJourneyRuleAction,
  pauseGuestJourneyRuleAction,
  refreshOwnerVisibleEventsAction,
  resumeGuestJourneyRuleAction,
  runDueJourneyRulesAction,
  runReviewRequestsAction,
} from "@/features/guest-journey/actions";

export function RunDueJourneyButton() {
  const [state, dispatch] = useActionState(runDueJourneyRulesAction, null);
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Run due rules now
      </button>
      {state?.ok && (
        <span className="text-xs text-success">
          executed {state.executed ?? 0} · skipped {state.skipped ?? 0} ·
          failed {state.failed ?? 0}
        </span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function RunReviewRequestsButton() {
  const [state, dispatch] = useActionState(runReviewRequestsAction, null);
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <button
        type="submit"
        className="h-9 px-4 rounded-full border border-line-soft text-xs hover:border-line-strong"
      >
        Sweep review requests
      </button>
      {state?.ok && (
        <span className="text-xs text-success">
          created {state.created ?? 0} · skipped {state.skipped ?? 0}
        </span>
      )}
    </form>
  );
}

export function PauseRuleButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(pauseGuestJourneyRuleAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-ink underline-offset-4 hover:underline"
      >
        Pause
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function ResumeRuleButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(resumeGuestJourneyRuleAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink hover:underline underline-offset-4"
      >
        Resume
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function ArchiveRuleButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(archiveGuestJourneyRuleAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Archive
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function RebuildOwnerEventsForm({
  defaultFrom,
  defaultTo,
}: {
  defaultFrom: string;
  defaultTo: string;
}) {
  const [state, dispatch] = useActionState(
    refreshOwnerVisibleEventsAction,
    null,
  );
  return (
    <form
      action={dispatch}
      className="flex flex-col gap-3 rounded-md border border-line-soft bg-surface p-5"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          Owner ID (optional)
          <input
            name="ownerId"
            type="text"
            placeholder="leave blank to rebuild all owners"
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          Villa ID (optional)
          <input
            name="villaId"
            type="text"
            placeholder="rebuilds for the villa's owners"
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          From
          <input
            name="from"
            type="date"
            defaultValue={defaultFrom}
            required
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
          To
          <input
            name="to"
            type="date"
            defaultValue={defaultTo}
            required
            className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-sm text-ink"
          />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Rebuild owner-visible events
        </button>
        {state?.ok && (
          <span className="text-xs text-success">
            inserted {state.inserted ?? 0}
            {state.ownersTouched != null
              ? ` · owners touched ${state.ownersTouched}`
              : ""}
            {state.ownersProcessed != null
              ? ` · owners processed ${state.ownersProcessed}`
              : ""}
          </span>
        )}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}
