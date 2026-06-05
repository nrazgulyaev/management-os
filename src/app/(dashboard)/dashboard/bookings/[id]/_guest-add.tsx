"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import { addBookingGuestAction } from "@/features/bookings/detail-actions";

export function AddGuestButton({ bookingId }: { bookingId: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState<"adult" | "child">("adult");
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const formRef = React.useRef<HTMLFormElement>(null);

  function handleOpen(next: boolean) {
    setOpen(next);
    if (!next) {
      setError(null);
      setKind("adult");
    }
  }

  function submit() {
    const formEl = formRef.current;
    if (!formEl) return;
    setError(null);
    const fd = new FormData(formEl);
    fd.set("kind", kind);
    start(async () => {
      const res = await addBookingGuestAction(bookingId, fd);
      if (res.ok) {
        handleOpen(false);
        router.refresh();
      } else {
        setError(res.error ?? "Could not add guest");
      }
    });
  }

  return (
    <>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        onClick={() => setOpen(true)}
      >
        + Add guest
      </button>
      <Modal open={open} onOpenChange={handleOpen} size="md">
        <ModalHeader
          title="Add guest"
          description="Add a named member to the party — adults can carry ID; children need only a name + age."
          onClose={() => handleOpen(false)}
        />
        <ModalBody>
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-3 py-2 text-sm text-ink mb-3">
              {error}
            </div>
          )}
          <form ref={formRef}>
            <div className="field">
              <label className="field-label">Full name</label>
              <input className="input" name="fullName" required autoFocus placeholder="Guest name" />
            </div>
            <div className="field-row">
              <div className="field">
                <label className="field-label">Type</label>
                <select
                  className="select"
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "adult" | "child")}
                >
                  <option value="adult">Adult</option>
                  <option value="child">Child</option>
                </select>
              </div>
              {kind === "adult" ? (
                <div className="field">
                  <label className="field-label">Role</label>
                  <select className="select" name="role" defaultValue="accompanying">
                    <option value="accompanying">Accompanying</option>
                    <option value="primary">Primary</option>
                  </select>
                </div>
              ) : (
                <div className="field">
                  <label className="field-label">Age</label>
                  <input className="input mono" name="ageYears" type="number" min={0} max={17} placeholder="8" />
                </div>
              )}
            </div>
            {kind === "adult" && (
              <>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Email</label>
                    <input className="input" name="email" type="email" placeholder="guest@example.com" />
                  </div>
                  <div className="field">
                    <label className="field-label">Phone</label>
                    <input className="input" name="phone" placeholder="+62 …" />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field">
                    <label className="field-label">Nationality</label>
                    <input className="input" name="nationality" placeholder="United States" />
                  </div>
                  <div className="field">
                    <label className="field-label">ID type</label>
                    <select className="select" name="idType" defaultValue="">
                      <option value="">None</option>
                      <option value="passport">Passport</option>
                      <option value="kitas">KITAS</option>
                      <option value="ktp">KTP</option>
                    </select>
                  </div>
                </div>
                <div className="field">
                  <label className="field-label">ID last 4</label>
                  <input className="input mono" name="idLast4" maxLength={8} placeholder="8841" />
                </div>
              </>
            )}
          </form>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleOpen(false)}
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
            {pending ? "Adding…" : "Add guest"}
          </button>
        </ModalFooter>
      </Modal>
    </>
  );
}
