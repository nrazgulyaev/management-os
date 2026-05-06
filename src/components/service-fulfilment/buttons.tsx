"use client";

import { useActionState, useState } from "react";
import {
  approveVendorInvoiceAction,
  archiveServiceVendorAction,
  bridgeFulfilmentToFinanceAction,
  bridgePendingFulfilmentsToFinanceAction,
  cancelFulfilmentAction,
  completeFulfilmentAction,
  createFulfilmentForOrderAction,
  failFulfilmentAction,
  hideGuestServiceRatingAction,
  issueVendorTokenAction,
  markVendorInvoicePaidAction,
  pauseServiceVendorAction,
  rejectVendorInvoiceAction,
  requestGuestConfirmationAction,
  reverseFulfilmentFinanceBridgeAction,
  revokeVendorTokenAction,
  transitionFulfilmentStatusAction,
  updateFulfilmentEtaAction,
  updateFulfilmentScheduleAction,
} from "@/features/service-fulfilment/actions";

export function CreateFulfilmentForOrderButton({ orderId }: { orderId: string }) {
  const [state, dispatch] = useActionState(
    createFulfilmentForOrderAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="orderId" value={orderId} />
      <input type="hidden" name="fulfilmentType" value="internal" />
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Create fulfilment
      </button>
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function TransitionStatusButton({
  fulfilmentId,
  to,
  label,
}: {
  fulfilmentId: string;
  to: string;
  label: string;
}) {
  const [state, dispatch] = useActionState(
    transitionFulfilmentStatusAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={fulfilmentId} />
      <input type="hidden" name="to" value={to} />
      <button
        type="submit"
        className="text-[11px] text-ink hover:underline underline-offset-4"
      >
        {label}
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function CancelFulfilmentButton({ fulfilmentId }: { fulfilmentId: string }) {
  const [state, dispatch] = useActionState(cancelFulfilmentAction, null);
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="id" value={fulfilmentId} />
      <input
        name="reason"
        placeholder="reason"
        className="h-8 px-2 rounded-md border border-line-soft bg-canvas text-xs"
      />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Cancel
      </button>
      {state && !state.ok && (
        <span className="text-[10px] text-danger ml-2">{state.error}</span>
      )}
    </form>
  );
}

export function FailFulfilmentButton({ fulfilmentId }: { fulfilmentId: string }) {
  const [, dispatch] = useActionState(failFulfilmentAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={fulfilmentId} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Mark failed
      </button>
    </form>
  );
}

export function CompleteFulfilmentInline({ fulfilmentId }: { fulfilmentId: string }) {
  const [state, dispatch] = useActionState(completeFulfilmentAction, null);
  return (
    <form action={dispatch} className="flex flex-wrap items-end gap-3">
      <input type="hidden" name="id" value={fulfilmentId} />
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Guest price (minor)
        <input
          name="guestPriceMinor"
          type="number"
          className="h-8 px-2 rounded-md border border-line-soft bg-canvas text-xs"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Internal cost (minor)
        <input
          name="internalCostMinor"
          type="number"
          className="h-8 px-2 rounded-md border border-line-soft bg-canvas text-xs"
        />
      </label>
      <button
        type="submit"
        className="h-8 px-3 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Complete
      </button>
      {state?.ok && <span className="text-xs text-success">Saved.</span>}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function ScheduleForm({ fulfilmentId }: { fulfilmentId: string }) {
  const [state, dispatch] = useActionState(
    updateFulfilmentScheduleAction,
    null,
  );
  return (
    <form action={dispatch} className="flex items-end gap-3">
      <input type="hidden" name="id" value={fulfilmentId} />
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        Schedule (UTC)
        <input
          name="scheduledFor"
          type="datetime-local"
          required
          className="h-8 px-2 rounded-md border border-line-soft bg-canvas text-xs"
        />
      </label>
      <button
        type="submit"
        className="h-8 px-3 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Save
      </button>
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function EtaForm({ fulfilmentId }: { fulfilmentId: string }) {
  const [state, dispatch] = useActionState(updateFulfilmentEtaAction, null);
  return (
    <form action={dispatch} className="flex items-end gap-3">
      <input type="hidden" name="id" value={fulfilmentId} />
      <label className="flex flex-col gap-1 text-xs text-ink-tertiary">
        ETA (UTC)
        <input
          name="etaAt"
          type="datetime-local"
          required
          className="h-8 px-2 rounded-md border border-line-soft bg-canvas text-xs"
        />
      </label>
      <button
        type="submit"
        className="h-8 px-3 rounded-full border border-line-soft text-xs hover:border-line-strong"
      >
        Update ETA
      </button>
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function RequestGuestConfirmationButton({ fulfilmentId }: { fulfilmentId: string }) {
  const [, dispatch] = useActionState(
    requestGuestConfirmationAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={fulfilmentId} />
      <button
        type="submit"
        className="text-[11px] text-ink hover:underline underline-offset-4"
      >
        Request guest confirmation
      </button>
    </form>
  );
}

export function IssueVendorTokenButton({ fulfilmentId }: { fulfilmentId: string }) {
  const [state, dispatch] = useActionState(issueVendorTokenAction, null);
  const [revealed, setRevealed] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <form
        action={async (fd) => {
          await dispatch(fd);
          setRevealed(true);
        }}
        className="inline-flex items-center gap-2"
      >
        <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Issue vendor link
        </button>
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </form>
      {revealed && state?.ok && state.token && (
        <div className="rounded-md border border-line-soft bg-canvas p-3 text-xs">
          <div className="text-ink-tertiary mb-1">
            Send this link to the vendor (shown once):
          </div>
          <div className="font-mono break-all text-ink">
            /vendor/service/{state.token}
          </div>
        </div>
      )}
    </div>
  );
}

export function RevokeVendorTokenButton({ id }: { id: string }) {
  const [, dispatch] = useActionState(revokeVendorTokenAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Revoke
      </button>
    </form>
  );
}

export function VendorStatusButton({ id, action }: { id: string; action: "pause" | "archive" }) {
  const [, dispatch] = useActionState(
    action === "pause" ? pauseServiceVendorAction : archiveServiceVendorAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-ink underline-offset-4 hover:underline"
      >
        {action === "pause" ? "Pause" : "Archive"}
      </button>
    </form>
  );
}

export function InvoiceStatusButton({
  id,
  action,
}: {
  id: string;
  action: "approve" | "reject" | "paid";
}) {
  const handler =
    action === "approve"
      ? approveVendorInvoiceAction
      : action === "reject"
        ? rejectVendorInvoiceAction
        : markVendorInvoicePaidAction;
  const [, dispatch] = useActionState(handler, null);
  const label =
    action === "approve" ? "Approve" : action === "reject" ? "Reject" : "Mark paid";
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink hover:underline underline-offset-4"
      >
        {label}
      </button>
    </form>
  );
}

export function HideRatingButton({ id }: { id: string }) {
  const [, dispatch] = useActionState(hideGuestServiceRatingAction, null);
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="id" value={id} />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Hide
      </button>
    </form>
  );
}

export function BridgeFulfilmentButton({ fulfilmentId }: { fulfilmentId: string }) {
  const [state, dispatch] = useActionState(
    bridgeFulfilmentToFinanceAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Bridge to finance
      </button>
      {state?.ok && (
        <span className="text-xs text-success">{state.status}</span>
      )}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

export function ReverseBridgeButton({ fulfilmentId }: { fulfilmentId: string }) {
  const [, dispatch] = useActionState(
    reverseFulfilmentFinanceBridgeAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex">
      <input type="hidden" name="fulfilmentId" value={fulfilmentId} />
      <input type="hidden" name="reason" value="manual_reversal" />
      <button
        type="submit"
        className="text-[11px] text-ink-tertiary hover:text-danger underline-offset-4 hover:underline"
      >
        Reverse
      </button>
    </form>
  );
}

export function BridgePendingButton() {
  const [state, dispatch] = useActionState(
    bridgePendingFulfilmentsToFinanceAction,
    null,
  );
  return (
    <form action={dispatch} className="inline-flex items-center gap-2">
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Bridge all pending
      </button>
      {state?.ok && (
        <span className="text-xs text-success">
          processed {state.processed ?? 0} · bridged {state.bridged ?? 0} ·
          skipped {state.skipped ?? 0} · failed {state.failed ?? 0}
        </span>
      )}
    </form>
  );
}
