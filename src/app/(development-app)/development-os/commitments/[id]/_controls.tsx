"use client";

/**
 * Wire-up — commitment-detail client islands.
 *
 * Posts to the "use server" adapters in ../_actions.ts, which wrap the
 * org-scoped commitment + drawdown lifecycle actions (commitment-actions.ts
 * / drawdown-actions.ts). No authority is added here — the buttons are
 * gated by status only to avoid posting calls the action would reject.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  SUPPORTED_CURRENCIES,
  CURRENCY_LABEL,
  DRAWDOWN_TRIGGER_REASONS,
  DRAWDOWN_TRIGGER_LABEL,
  DRAWDOWN_PAYMENT_METHODS,
} from "@/lib/development/constants/investor-constants";
import {
  updateCommitmentTermsAction,
  cancelCommitmentAction,
  closeCommitmentAction,
  requestDrawdownAction,
  confirmDrawdownReceiptAction,
  cancelDrawdownAction,
} from "../_actions";

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";
const dangerBtn =
  "text-xs px-2.5 py-1.5 rounded border border-danger/40 text-danger bg-surface hover:bg-danger-weak/40 disabled:opacity-50";

function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-3">{title}</h2>
        {children}
      </div>
    </div>
  );
}

function L({
  label,
  span2,
  children,
}: {
  label: string;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}
    >
      {label}
      {children}
    </label>
  );
}

// ---------------------------------------------------------------------------
// Commitment lifecycle: Edit terms / Cancel / Close
// ---------------------------------------------------------------------------

export function CommitmentLifecycleControls({
  commitmentId,
  status,
  profitSharePercent,
  capitalReturnPriority,
  signedAt,
  notes,
}: {
  commitmentId: string;
  status: string;
  profitSharePercent: string;
  capitalReturnPriority: number;
  signedAt: string | null;
  notes: string | null;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  // active / fully_called are still mutable; closed / cancelled are terminal.
  const isOpen = status === "active" || status === "fully_called";

  function submitEdit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await updateCommitmentTermsAction({
        id: commitmentId,
        profitSharePercent: String(fd.get("profitSharePercent") ?? "").trim(),
        capitalReturnPriority: Number(fd.get("capitalReturnPriority") ?? 1),
        signedAt: String(fd.get("signedAt") ?? "").trim() || null,
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  function submitCancel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const reason = String(fd.get("reason") ?? "").trim();
    start(async () => {
      const r = await cancelCommitmentAction(commitmentId, reason);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setCancelling(false);
      router.refresh();
    });
  }

  function close() {
    setErr(null);
    start(async () => {
      const r = await closeCommitmentAction(commitmentId);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      router.refresh();
    });
  }

  if (!isOpen) {
    return err ? <span className="text-[11px] text-danger">{err}</span> : null;
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={() => {
          setErr(null);
          setEditing(true);
        }}
      >
        Edit terms
      </Button>
      <button type="button" className={dangerBtn} disabled={pending} onClick={close}>
        Close commitment
      </button>
      <button
        type="button"
        className={dangerBtn}
        disabled={pending}
        onClick={() => {
          setErr(null);
          setCancelling(true);
        }}
      >
        Cancel commitment
      </button>
      {err && <span className="text-[11px] text-danger">{err}</span>}

      {editing && (
        <Modal title="Edit commitment terms" onClose={() => setEditing(false)}>
          <form onSubmit={submitEdit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <L label="Profit share %">
                <input
                  name="profitSharePercent"
                  pattern="\d+(\.\d+)?"
                  defaultValue={profitSharePercent}
                  className={inputCls}
                />
              </L>
              <L label="Capital-return priority">
                <input
                  name="capitalReturnPriority"
                  type="number"
                  min={1}
                  step={1}
                  defaultValue={capitalReturnPriority}
                  className={inputCls}
                />
              </L>
              <L label="Signed at">
                <input
                  name="signedAt"
                  type="date"
                  defaultValue={signedAt ?? ""}
                  className={inputCls}
                />
              </L>
              <L label="Notes" span2>
                <textarea
                  name="notes"
                  rows={2}
                  defaultValue={notes ?? ""}
                  className={inputCls}
                />
              </L>
            </div>
            {err && (
              <div className="rounded border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
                {err}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setEditing(false)}
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Saving…" : "Save terms"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {cancelling && (
        <Modal title="Cancel commitment" onClose={() => setCancelling(false)}>
          <form onSubmit={submitCancel} className="space-y-3">
            <p className="text-xs text-ink-secondary">
              Cancelling preserves the row as a tombstone. Only allowed when no
              drawdowns have been recorded.
            </p>
            <L label="Reason (min 3 chars)" span2>
              <textarea
                name="reason"
                required
                minLength={3}
                rows={2}
                className={inputCls}
                placeholder="Why is this commitment being cancelled?"
              />
            </L>
            {err && (
              <div className="rounded border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
                {err}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCancelling(false)}
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
              >
                Keep
              </button>
              <button
                type="submit"
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded bg-danger text-surface hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Cancelling…" : "Confirm cancel"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Request capital call (drawdown)
// ---------------------------------------------------------------------------

export function RequestDrawdownControl({
  commitmentId,
  status,
  defaultCurrency,
}: {
  commitmentId: string;
  status: string;
  defaultCurrency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  // A capital call cannot be made on a cancelled / closed commitment.
  const canRequest = status !== "cancelled" && status !== "closed";
  if (!canRequest) return null;

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await requestDrawdownAction({
        commitmentId,
        amountMajor: String(fd.get("amountMajor") ?? "").trim(),
        currency: String(fd.get("currency") ?? defaultCurrency),
        fxRateAtDrawdown: String(fd.get("fxRateAtDrawdown") ?? "").trim() || "1",
        dueDate: String(fd.get("dueDate") ?? ""),
        triggerReason: String(fd.get("triggerReason") ?? "manual"),
        notes: String(fd.get("notes") ?? "").trim() || null,
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="accent"
        size="sm"
        onClick={() => {
          setErr(null);
          setOpen(true);
        }}
      >
        Request capital call
      </Button>
      {open && (
        <Modal title="Request capital call" onClose={() => setOpen(false)}>
          <form onSubmit={submit} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <L label="Amount">
                <input
                  name="amountMajor"
                  type="number"
                  min="0"
                  step="any"
                  required
                  className={inputCls}
                  placeholder="100000"
                />
              </L>
              <L label="Currency">
                <select name="currency" defaultValue={defaultCurrency} className={inputCls}>
                  {SUPPORTED_CURRENCIES.map((c) => (
                    <option key={c} value={c}>
                      {CURRENCY_LABEL[c]}
                    </option>
                  ))}
                </select>
              </L>
              <L label="FX rate (1 USD = N)">
                <input
                  name="fxRateAtDrawdown"
                  pattern="\d+(\.\d+)?"
                  defaultValue="1"
                  required
                  className={inputCls}
                />
              </L>
              <L label="Due date">
                <input name="dueDate" type="date" required className={inputCls} />
              </L>
              <L label="Trigger reason" span2>
                <select name="triggerReason" defaultValue="manual" className={inputCls}>
                  {DRAWDOWN_TRIGGER_REASONS.map((t) => (
                    <option key={t} value={t}>
                      {DRAWDOWN_TRIGGER_LABEL[t]}
                    </option>
                  ))}
                </select>
              </L>
              <L label="Notes" span2>
                <textarea name="notes" rows={2} className={inputCls} placeholder="Optional" />
              </L>
            </div>
            {err && (
              <div className="rounded border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
                {err}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Requesting…" : "Request call"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Per-drawdown: Confirm receipt / Cancel
// ---------------------------------------------------------------------------

export function DrawdownRowControls({
  commitmentId,
  drawdownId,
  status,
}: {
  commitmentId: string;
  drawdownId: string;
  status: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  const [confirming, setConfirming] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);

  // received / cancelled are terminal — no further actions.
  const canAct = status === "requested" || status === "overdue";

  function submitConfirm(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    start(async () => {
      const r = await confirmDrawdownReceiptAction({
        commitmentId,
        drawdownId,
        receivedAt: String(fd.get("receivedAt") ?? "").trim() || undefined,
        paymentMethod: String(fd.get("paymentMethod") ?? "bank_wire"),
        paymentReference: String(fd.get("paymentReference") ?? "").trim() || null,
      });
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setConfirming(false);
      router.refresh();
    });
  }

  function submitCancel(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const fd = new FormData(e.currentTarget);
    const reason = String(fd.get("reason") ?? "").trim();
    start(async () => {
      const r = await cancelDrawdownAction(commitmentId, drawdownId, reason);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      setCancelling(false);
      router.refresh();
    });
  }

  if (!canAct) {
    return err ? <span className="text-[10px] text-danger">{err}</span> : null;
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <button
        type="button"
        className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
        disabled={pending}
        onClick={() => {
          setErr(null);
          setConfirming(true);
        }}
      >
        Confirm receipt
      </button>
      <button
        type="button"
        className={dangerBtn}
        disabled={pending}
        onClick={() => {
          setErr(null);
          setCancelling(true);
        }}
      >
        Cancel
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}

      {confirming && (
        <Modal title="Confirm drawdown receipt" onClose={() => setConfirming(false)}>
          <form onSubmit={submitConfirm} className="space-y-3">
            <p className="text-xs text-ink-secondary">
              This credits the investor wallet by the drawdown&apos;s USD amount
              and writes a wallet transaction.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <L label="Received at (default: now)">
                <input name="receivedAt" type="date" className={inputCls} />
              </L>
              <L label="Payment method">
                <select name="paymentMethod" defaultValue="bank_wire" className={inputCls}>
                  {DRAWDOWN_PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </L>
              <L label="Payment reference" span2>
                <input
                  name="paymentReference"
                  className={inputCls}
                  placeholder="Wire / tx reference (optional)"
                />
              </L>
            </div>
            {err && (
              <div className="rounded border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
                {err}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Confirming…" : "Confirm receipt"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {cancelling && (
        <Modal title="Cancel drawdown" onClose={() => setCancelling(false)}>
          <form onSubmit={submitCancel} className="space-y-3">
            <L label="Reason (min 3 chars)" span2>
              <textarea
                name="reason"
                required
                minLength={3}
                rows={2}
                className={inputCls}
                placeholder="Why is this capital call being cancelled?"
              />
            </L>
            {err && (
              <div className="rounded border border-danger/30 bg-danger-weak/40 px-3 py-2 text-xs text-ink">
                {err}
              </div>
            )}
            <div className="flex items-center justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setCancelling(false)}
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
              >
                Keep
              </button>
              <button
                type="submit"
                disabled={pending}
                className="text-sm px-3 py-1.5 rounded bg-danger text-surface hover:opacity-90 disabled:opacity-50"
              >
                {pending ? "Cancelling…" : "Confirm cancel"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
