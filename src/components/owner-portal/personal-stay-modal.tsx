"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.3 owner-04 — PersonalStayModal.
 *
 * Form-md. Date range + who's coming + notes. On submit, creates a
 * `booking` row with kind=owner_stay, status=requested. Mgmt
 * arbitrates if it overlaps a confirmed guest booking.
 */

export interface PersonalStayValues {
  villaId: string;
  startDate: string;
  endDate: string;
  partySize: number;
  guestNames: string;
  notes: string;
}

export interface PersonalStayModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  villas: { id: string; label: string }[];
  onSubmit?: (values: PersonalStayValues) => Promise<void> | void;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}
function addMonthsIso(d: string, m: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCMonth(dt.getUTCMonth() + m);
  return dt.toISOString().slice(0, 10);
}
function addDaysIso(d: string, days: number) {
  const dt = new Date(d + "T00:00:00Z");
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function PersonalStayModal({ open, onOpenChange, villas, onSubmit }: PersonalStayModalProps) {
  const tomorrow = addDaysIso(todayIso(), 1);
  const max = addMonthsIso(todayIso(), 12);

  const [villaId, setVillaId] = React.useState(villas[0]?.id ?? "");
  const [startDate, setStartDate] = React.useState(tomorrow);
  const [endDate, setEndDate] = React.useState(addDaysIso(tomorrow, 2));
  const [partySize, setPartySize] = React.useState(2);
  const [guestNames, setGuestNames] = React.useState("");
  const [notes, setNotes] = React.useState("");

  React.useEffect(() => {
    if (!open) {
      setVillaId(villas[0]?.id ?? "");
      setStartDate(tomorrow);
      setEndDate(addDaysIso(tomorrow, 2));
      setPartySize(2);
      setGuestNames("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const valid =
    villaId &&
    startDate >= tomorrow &&
    endDate > startDate &&
    endDate <= max;
  const dirty = guestNames.length > 0 || notes.length > 0;

  async function submit() {
    if (!valid) return;
    await onSubmit?.({ villaId, startDate, endDate, partySize, guestNames, notes });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={dirty} ariaLabel="Request a personal stay">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <rect x="3" y="4" width="18" height="18" rx="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
        }
        glyphTone="accent"
        title="Request a personal stay"
        description="We'll send this to our team. Confirmed within 48h unless it overlaps a guest booking."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Villa</label>
          <select className="select" value={villaId} onChange={(e) => setVillaId(e.target.value)}>
            {villas.map((v) => (
              <option key={v.id} value={v.id}>{v.label}</option>
            ))}
          </select>
        </div>
        <div className="field-row">
          <div className="field">
            <label className="field-label">Check-in</label>
            <input
              className="input"
              type="date"
              value={startDate}
              min={tomorrow}
              max={max}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="field">
            <label className="field-label">Check-out</label>
            <input
              className="input"
              type="date"
              value={endDate}
              min={addDaysIso(startDate, 1)}
              max={max}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>
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
        <div className="field">
          <label className="field-label">Who&apos;s coming</label>
          <input
            className="input"
            value={guestNames}
            onChange={(e) => setGuestNames(e.target.value)}
            placeholder="Names / relationship — helps the team prep"
          />
        </div>
        <div className="field">
          <label className="field-label">Notes</label>
          <textarea
            className="textarea"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Any prep — early check-in, dietary, chef requests…"
          />
        </div>
      </ModalBody>
      <ModalFooter help="Confirmed within 48h">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!valid}>
          Request stay
        </button>
      </ModalFooter>
    </Modal>
  );
}
