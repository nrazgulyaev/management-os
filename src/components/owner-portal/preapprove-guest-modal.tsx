"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import type { OwnerVillaOption } from "@/features/owner-portal/engagement-types";

/**
 * OWNER-ENGAGEMENT (#168 follow-up) — PreApproveGuestModal.
 *
 * The owner authorises a friend / family member to be hosted at one of
 * their villas for a window — no paid booking. Submits to
 * preApproveGuestAction, which writes an owner_guest_preapprovals record
 * and opens a thread mgmt confirms in.
 */

export interface PreApproveGuestValues {
  villaId: string;
  guestName: string;
  guestRelationship: string;
  partySize: number;
  arriveOn: string;
  departOn: string;
  notes: string;
}

export interface PreApproveGuestModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  villas: OwnerVillaOption[];
  onSubmit: (values: PreApproveGuestValues) => Promise<{ ok: boolean; error?: string }>;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(d: string, days: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function PreApproveGuestModal({ open, onOpenChange, villas, onSubmit }: PreApproveGuestModalProps) {
  const tomorrow = addDaysIso(todayIso(), 1);

  const [villaId, setVillaId] = React.useState(villas[0]?.id ?? "");
  const [guestName, setGuestName] = React.useState("");
  const [relationship, setRelationship] = React.useState("");
  const [partySize, setPartySize] = React.useState(2);
  const [arriveOn, setArriveOn] = React.useState(tomorrow);
  const [departOn, setDepartOn] = React.useState(addDaysIso(tomorrow, 3));
  const [notes, setNotes] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setVillaId(villas[0]?.id ?? "");
      setGuestName("");
      setRelationship("");
      setPartySize(2);
      setArriveOn(tomorrow);
      setDepartOn(addDaysIso(tomorrow, 3));
      setNotes("");
      setError(null);
      setBusy(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid = Boolean(villaId) && guestName.trim().length >= 2 && departOn > arriveOn;
  const dirty = guestName.length > 0 || relationship.length > 0 || notes.length > 0;

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await onSubmit({
      villaId,
      guestName: guestName.trim(),
      guestRelationship: relationship.trim(),
      partySize,
      arriveOn,
      departOn,
      notes: notes.trim(),
    });
    setBusy(false);
    if (res.ok) onOpenChange(false);
    else setError(res.error ?? "Something went wrong.");
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="Pre-approve a guest">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
          </svg>
        }
        glyphTone="accent"
        title="Pre-approve a guest"
        description="Authorise a friend or family member to be hosted — no booking needed. Your team confirms and preps."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        {villas.length > 0 && (
          <div className="field">
            <label className="field-label">Villa</label>
            <select className="select" value={villaId} onChange={(e) => setVillaId(e.target.value)}>
              {villas.map((v) => (
                <option key={v.id} value={v.id}>{v.label}</option>
              ))}
            </select>
          </div>
        )}
        <div className="field">
          <label className="field-label">Guest name</label>
          <input
            className="input"
            value={guestName}
            onChange={(e) => setGuestName(e.target.value)}
            placeholder="Who's visiting"
          />
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Relationship</label>
            <input
              className="input"
              value={relationship}
              onChange={(e) => setRelationship(e.target.value)}
              placeholder="Friend, family…"
            />
          </div>
          <div className="field">
            <label className="field-label">Party size</label>
            <input
              className="input"
              type="number"
              min={1}
              max={20}
              value={partySize}
              onChange={(e) => setPartySize(Number(e.target.value))}
            />
          </div>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Arrives</label>
            <input
              className="input"
              type="date"
              value={arriveOn}
              min={tomorrow}
              onChange={(e) => setArriveOn(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">Departs</label>
            <input
              className="input"
              type="date"
              value={departOn}
              min={addDaysIso(arriveOn, 1)}
              onChange={(e) => setDepartOn(e.target.value)}
            />
          </div>
        </div>
        <div className="field">
          <label className="field-label">Notes for the team</label>
          <textarea
            className="textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Anything to prep — early arrival, dietary, transfers…"
          />
        </div>
        {error && (
          <p className="text-xs text-terra" role="alert">{error}</p>
        )}
      </ModalBody>
      <ModalFooter help="Your team confirms before the guest arrives">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!valid || busy}>
          {busy ? "Submitting…" : "Pre-approve guest"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
