"use client";

import { useActionState } from "react";
import {
  acknowledgeHandoffAction,
  resolveHandoffAction,
  archiveSessionAction,
} from "@/features/guest-ai-concierge/handoff-actions";

export function AcknowledgeHandoffButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(acknowledgeHandoffAction, null);
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Acknowledge
      </button>
      {state?.ok && <span className="text-xs text-success">Done.</span>}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function ResolveHandoffForm({ id }: { id: string }) {
  const [state, dispatch] = useActionState(resolveHandoffAction, null);
  return (
    <form
      action={dispatch}
      className="rounded-md border border-line-soft bg-canvas p-3 flex flex-col gap-2"
    >
      <input type="hidden" name="id" value={id} />
      <input
        name="note"
        maxLength={500}
        placeholder="Resolution note (optional)"
        className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-xs"
      />
      <div className="flex items-center gap-2">
        <button
          type="submit"
          className="h-9 px-4 rounded-full border border-line-soft hover:border-line-strong text-xs"
        >
          Mark resolved
        </button>
        {state?.ok && <span className="text-xs text-success">Resolved.</span>}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

export function ArchiveSessionButton({ id }: { id: string }) {
  const [state, dispatch] = useActionState(archiveSessionAction, null);
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="h-9 px-4 rounded-full border border-line-soft hover:border-line-strong text-xs"
      >
        Archive session
      </button>
      {state?.ok && <span className="text-xs text-success">Archived.</span>}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}
