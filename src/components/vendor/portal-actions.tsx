"use client";

import { useActionState } from "react";
import {
  vendorAcceptFulfilmentAction,
  vendorDeclineFulfilmentAction,
  vendorMarkCompletedAction,
  vendorMarkInProgressAction,
  vendorUpdateEtaAction,
} from "@/features/service-fulfilment/actions";

export function VendorAcceptButton({ token }: { token: string }) {
  const [state, dispatch] = useActionState(
    vendorAcceptFulfilmentAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Accept
      </button>
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function VendorDeclineButton({ token }: { token: string }) {
  const [state, dispatch] = useActionState(
    vendorDeclineFulfilmentAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="token" value={token} />
      <input
        name="reason"
        placeholder="reason (optional)"
        className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-xs"
      />
      <button
        type="submit"
        className="h-9 px-4 rounded-full border border-line-soft text-xs hover:border-line-strong"
      >
        Decline
      </button>
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function VendorEtaForm({ token }: { token: string }) {
  const [state, dispatch] = useActionState(vendorUpdateEtaAction, null);
  return (
    <form action={dispatch} className="flex items-end gap-3">
      <input type="hidden" name="token" value={token} />
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        ETA (UTC)
        <input
          name="etaAt"
          type="datetime-local"
          required
          className="h-9 px-3 rounded-md border border-line-soft bg-canvas text-xs"
        />
      </label>
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Update ETA
      </button>
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function VendorMarkInProgressButton({ token }: { token: string }) {
  const [, dispatch] = useActionState(
    vendorMarkInProgressAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Mark in progress
      </button>
    </form>
  );
}

export function VendorMarkCompletedButton({ token }: { token: string }) {
  const [, dispatch] = useActionState(vendorMarkCompletedAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="token" value={token} />
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-success text-ink-inverse text-xs font-medium hover:bg-success/90"
      >
        Mark completed
      </button>
    </form>
  );
}
