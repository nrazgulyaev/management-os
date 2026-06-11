"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { recordBookingPaymentAction } from "@/features/bookings/detail-actions";

export function AddPaymentButton({
  bookingId,
  currency,
  outstanding,
}: {
  bookingId: string;
  currency: string;
  /** Pre-fills the amount with what is still due. */
  outstanding: number;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);
  const today = new Date().toISOString().slice(0, 10);
  const defaultAmount =
    outstanding > 0 ? String(Math.round(outstanding * 100) / 100) : "";

  function submit() {
    const formEl = formRef.current;
    if (!formEl) return;
    setError(null);
    const fd = new FormData(formEl);
    fd.set("currency", currency);
    start(async () => {
      const res = await recordBookingPaymentAction(bookingId, fd);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Could not record payment");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-accent btn-sm"
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        + Add payment
      </button>
      <Modal open={open} onOpenChange={setOpen} size="md">
        <ModalHeader
          title="Record a payment"
          description="Log money received against this booking — works before check-in, on arrival, or at check-out."
          onClose={() => setOpen(false)}
        />
        <ModalBody>
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink mb-3">
              {error}
            </div>
          )}
          <form ref={formRef}>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Method</label>
                <select className="select" name="method" defaultValue="cash">
                  <option value="cash">Cash</option>
                  <option value="transfer">Bank transfer</option>
                  <option value="card-manual">Card (manual)</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Date received</label>
                <input className="input" name="receivedAt" type="date" defaultValue={today} />
              </div>
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Amount ({currency})</label>
                <input
                  className="input mono"
                  name="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  required
                  defaultValue={defaultAmount}
                  placeholder="0"
                />
              </div>
              <div className="field">
                <label className="field-label">Note (optional)</label>
                <input
                  className="input"
                  name="note"
                  maxLength={200}
                  placeholder="Cash on arrival"
                />
              </div>
            </div>
          </form>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => setOpen(false)}
            disabled={pending}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-accent btn-sm"
            onClick={submit}
            disabled={pending}
          >
            {pending ? "Recording…" : "Record payment"}
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
