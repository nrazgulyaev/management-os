"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { addBookingChargeAction } from "@/features/bookings/detail-actions";

export function AddChargeButton({
  bookingId,
  currency,
}: {
  bookingId: string;
  currency: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  function submit() {
    const formEl = formRef.current;
    if (!formEl) return;
    setError(null);
    const fd = new FormData(formEl);
    fd.set("currency", currency);
    start(async () => {
      const res = await addBookingChargeAction(bookingId, fd);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Could not add charge");
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
        + Add charge
      </button>
      <Modal open={open} onOpenChange={setOpen} size="md">
        <ModalHeader
          title="Add charge"
          description="Append a line to the charge ledger. Use “Deduction” for fees and refunds."
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
                <label className="field-label">Type</label>
                <select className="select" name="chargeType" defaultValue="service">
                  <option value="nightly">Nightly</option>
                  <option value="service">Service</option>
                  <option value="fee">Fee</option>
                  <option value="tax">Tax</option>
                  <option value="discount">Discount</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Direction</label>
                <select className="select" name="direction" defaultValue="charge">
                  <option value="charge">Charge (+)</option>
                  <option value="deduction">Deduction (−)</option>
                </select>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Description</label>
              <input className="input" name="description" required placeholder="Late check-out fee" />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Amount ({currency})</label>
                <input className="input mono" name="amount" type="number" min={0} step="0.01" required placeholder="350000" />
              </div>
              <div className="field">
                <label className="field-label">Note (optional)</label>
                <input className="input" name="note" maxLength={40} placeholder="BASE" />
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
            {pending ? "Adding…" : "Add charge"}
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
