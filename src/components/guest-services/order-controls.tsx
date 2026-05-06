"use client";

import { useActionState } from "react";
import {
  addOrderNoteAction,
  bridgeOrderAction,
  transitionOrderAction,
} from "@/features/guest-services/actions";
import {
  ORDER_STATUS_LABELS,
  nextAllowedStatuses,
  type OrderStatus,
} from "@/features/guest-services/status";

export function OrderTransitionForm({
  orderId,
  currentStatus,
  currency,
  pricingModel,
}: {
  orderId: string;
  currentStatus: OrderStatus;
  currency: string;
  pricingModel: string;
}) {
  const [state, dispatch] = useActionState(transitionOrderAction, null);
  const allowed = nextAllowedStatuses(currentStatus);
  if (allowed.length === 0) {
    return (
      <p className="text-xs text-ink-tertiary">
        This order is in a terminal state ({ORDER_STATUS_LABELS[currentStatus]}).
      </p>
    );
  }
  return (
    <form
      action={dispatch}
      className="rounded-md border border-line-soft bg-canvas p-4 grid grid-cols-1 md:grid-cols-2 gap-3"
    >
      <input type="hidden" name="id" value={orderId} />
      <Field label="Move to">
        <select
          name="to"
          required
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm"
        >
          {allowed.map((s) => (
            <option key={s} value={s}>
              {ORDER_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Assign to (optional, app_user UUID)">
        <input
          name="assignedTo"
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm font-mono"
          placeholder="user UUID"
        />
      </Field>
      <Field
        label={`Quote price (${currency} minor, optional)${pricingModel === "quote_required" ? " — required for quoted orders" : ""}`}
        className="md:col-span-2"
      >
        <input
          name="guestPriceMinorOverride"
          type="number"
          min={0}
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm font-mono tabular-nums"
        />
      </Field>
      <Field
        label={`Internal cost override (${currency} minor, optional)`}
        className="md:col-span-2"
      >
        <input
          name="internalCostMinorOverride"
          type="number"
          min={0}
          className="h-9 px-3 rounded-sm border border-line-soft bg-surface text-sm font-mono tabular-nums"
        />
      </Field>
      <Field label="Visible note (logged on order)" className="md:col-span-2">
        <textarea
          name="message"
          rows={2}
          className="px-3 py-2 rounded-sm border border-line-soft bg-surface text-sm resize-none"
        />
      </Field>
      <Field label="Internal-only note (optional)" className="md:col-span-2">
        <textarea
          name="internalNote"
          rows={2}
          className="px-3 py-2 rounded-sm border border-line-soft bg-surface text-sm resize-none"
        />
      </Field>
      <div className="md:col-span-2 flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Apply transition
        </button>
        {state?.ok && <span className="text-xs text-success">Updated.</span>}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

export function AddOrderNoteForm({ orderId }: { orderId: string }) {
  const [state, dispatch] = useActionState(addOrderNoteAction, null);
  return (
    <form
      action={dispatch}
      className="rounded-md border border-line-soft bg-canvas p-4 flex flex-col gap-3"
    >
      <input type="hidden" name="id" value={orderId} />
      <textarea
        name="message"
        rows={2}
        required
        className="px-3 py-2 rounded-sm border border-line-soft bg-surface text-sm resize-none"
        placeholder="Add a note to the timeline…"
      />
      <div className="flex items-center gap-3">
        <button
          type="submit"
          className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
        >
          Add note
        </button>
        {state?.ok && <span className="text-xs text-success">Saved.</span>}
        {state && !state.ok && (
          <span className="text-xs text-danger">{state.error}</span>
        )}
      </div>
    </form>
  );
}

export function BridgeOrderForm({ orderId }: { orderId: string }) {
  const [state, dispatch] = useActionState(bridgeOrderAction, null);
  return (
    <form action={dispatch} className="flex items-center gap-3">
      <input type="hidden" name="id" value={orderId} />
      <input
        name="reason"
        placeholder="Reason (optional)"
        className="h-9 px-3 rounded-sm border border-line-soft bg-canvas text-sm flex-1"
      />
      <button
        type="submit"
        className="h-9 px-4 rounded-full bg-ink text-ink-inverse text-xs font-medium hover:bg-ink/90"
      >
        Retry bridge
      </button>
      {state?.ok && <span className="text-xs text-success">Bridged.</span>}
      {state && !state.ok && (
        <span className="text-xs text-danger">{state.error}</span>
      )}
    </form>
  );
}

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ""}`}>
      <span className="text-[10px] uppercase tracking-widest text-ink-tertiary">
        {label}
      </span>
      {children}
    </label>
  );
}
