"use client";

import * as React from "react";
import { ConfirmModal } from "@/components/ui/modal";

export interface ResolveTicketValues {
  ticketId: string;
  costUsd: number;
  notes: string;
  ownerVisible: boolean;
  photoNames: string[];
}

export interface ResolveTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: { id: string; ref: string; title: string } | null;
  onConfirm?: (values: ResolveTicketValues) => Promise<void> | void;
}

export function ResolveTicketModal({ open, onOpenChange, ticket, onConfirm }: ResolveTicketModalProps) {
  const [costUsd, setCost] = React.useState(0);
  const [notes, setNotes] = React.useState("");
  const [ownerVisible, setOwnerVisible] = React.useState(false);
  const [photos, setPhotos] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (!open) {
      setCost(0);
      setNotes("");
      setOwnerVisible(false);
      setPhotos([]);
    }
  }, [open]);

  if (!ticket) return null;

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Resolve ${ticket.ref}?`}
      body={
        <>
          <p style={{ margin: "4px 0 8px", fontSize: 13, color: "var(--ink-3)" }}>{ticket.title}</p>
          <div className="field-row">
            <div className="field">
              <label className="field-label">Cost (USD)</label>
              <input className="input mono" type="number" min={0} value={costUsd} onChange={(e) => setCost(Number(e.target.value))} />
            </div>
            <div className="field">
              <label className="field-label">Photos after</label>
              <input
                type="file"
                multiple
                accept="image/*"
                className="input"
                onChange={(e) => setPhotos(Array.from(e.target.files ?? []).map((f) => f.name))}
              />
            </div>
          </div>
          <div className="field">
            <label className="field-label">Resolution notes</label>
            <textarea className="textarea" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, paddingTop: 6 }}>
            <input type="checkbox" checked={ownerVisible} onChange={(e) => setOwnerVisible(e.target.checked)} />
            Owner-visible in portal (cost surfaces on next statement)
          </label>
        </>
      }
      confirmLabel="Resolve ticket"
      onConfirm={async () => {
        await onConfirm?.({ ticketId: ticket.id, costUsd, notes: notes.trim(), ownerVisible, photoNames: photos });
      }}
    />
  );
}
