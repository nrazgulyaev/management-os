"use client";

/**
 * Phase 2.1 PR 3 — "New booking" CTA wired to the template-06 Modal.
 *
 * Replaces the previous `<Link href="/dashboard/bookings/new">`. The
 * form is wireframe-only for this PR — fields render, ⌘+Enter
 * shortcut works, but submission posts to the legacy /new page so
 * server actions stay intact. Real inline-create lands in 2.2.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

const FIELDS = ["villa", "checkIn", "checkOut", "guest", "channel"] as const;
type FieldId = (typeof FIELDS)[number];

const INITIAL: Record<FieldId, string> = {
  villa: "",
  checkIn: "",
  checkOut: "",
  guest: "",
  channel: "direct",
};

export function NewBookingCta() {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [values, setValues] = React.useState<Record<FieldId, string>>(INITIAL);
  const firstFieldRef = React.useRef<HTMLInputElement>(null);

  const dirty = FIELDS.some((k) => values[k] !== INITIAL[k]);

  function update<K extends FieldId>(key: K, value: string) {
    setValues((p) => ({ ...p, [key]: value }));
  }

  function handleOpen(next: boolean) {
    setOpen(next);
    if (!next) setValues(INITIAL);
  }

  function submit() {
    // PR 3 proof-of-life — hand off to the legacy /new page. The
    // values aren't yet posted (server action lands in 2.2); for
    // now we just navigate so the user can complete creation.
    setOpen(false);
    router.push("/dashboard/bookings/new");
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLFormElement>) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-primary btn-sm"
        onClick={() => setOpen(true)}
      >
        New booking +
      </button>
      <Modal open={open} onOpenChange={handleOpen} size="md" dirty={dirty}>
        <ModalHeader
          glyph={
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
          }
          glyphTone="accent"
          title="New booking"
          description="Create a direct booking. Channel bookings sync automatically and don't need this form."
          onClose={() => handleOpen(false)}
        />
        <ModalBody>
          <form onKeyDown={onKeyDown}>
            <div className="field">
              <label className="field-label">Villa</label>
              <input
                ref={firstFieldRef}
                className="input"
                autoFocus
                value={values.villa}
                onChange={(e) => update("villa", e.target.value)}
                placeholder="EV-07"
              />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Check-in</label>
                <input
                  className="input"
                  type="date"
                  value={values.checkIn}
                  onChange={(e) => update("checkIn", e.target.value)}
                />
              </div>
              <div className="field">
                <label className="field-label">Check-out</label>
                <input
                  className="input"
                  type="date"
                  value={values.checkOut}
                  onChange={(e) => update("checkOut", e.target.value)}
                />
              </div>
            </div>
            <div className="field">
              <label className="field-label">Primary guest</label>
              <input
                className="input"
                value={values.guest}
                onChange={(e) => update("guest", e.target.value)}
                placeholder="Full name"
              />
            </div>
            <div className="field">
              <label className="field-label">Channel</label>
              <select
                className="select"
                value={values.channel}
                onChange={(e) => update("channel", e.target.value)}
              >
                <option value="direct">Direct</option>
                <option value="airbnb">Airbnb</option>
                <option value="booking">Booking.com</option>
                <option value="agoda">Agoda</option>
              </select>
            </div>
          </form>
        </ModalBody>
        <ModalFooter help="⌘ + Enter to save">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleOpen(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={submit}
            disabled={!dirty}
          >
            Continue →
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
