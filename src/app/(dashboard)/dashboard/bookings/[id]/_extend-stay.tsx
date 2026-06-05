"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { extendBookingStayAction } from "@/features/bookings/detail-actions";

export function ExtendStayButton({
  bookingId,
  checkIn,
  checkOut,
}: {
  bookingId: string;
  checkIn: string;
  checkOut: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(checkOut);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  function submit() {
    setError(null);
    const fd = new FormData();
    fd.set("checkOut", value);
    start(async () => {
      const res = await extendBookingStayAction(bookingId, fd);
      if (res.ok) {
        setOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Could not extend stay");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => {
          setValue(checkOut);
          setError(null);
          setOpen(true);
        }}
      >
        Extend stay
      </button>
      <Modal open={open} onOpenChange={setOpen} size="sm" dirty={value !== checkOut}>
        <ModalHeader
          title="Extend stay"
          description="Push out the check-out date — we re-check the villa is free for the new window."
          onClose={() => setOpen(false)}
        />
        <ModalBody>
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink mb-3">
              {error}
            </div>
          )}
          <div className="field">
            <label className="field-label">New check-out</label>
            <input
              className="input"
              type="date"
              min={checkIn}
              value={value}
              onChange={(e) => setValue(e.target.value)}
            />
          </div>
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
            disabled={pending || !value || value === checkOut}
          >
            {pending ? "Saving…" : "Extend stay"}
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
