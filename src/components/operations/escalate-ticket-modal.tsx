"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import type { TicketPriority } from "@/features/maintenance/sla";

export interface EscalateTicketValues {
  ticketId: string;
  newAssigneeId: string | null;
  newPriority: TicketPriority;
  reason: string;
}

export interface EscalateTicketModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ticket: { id: string; ref: string; priority: TicketPriority; assigneeId: string | null } | null;
  candidates: { id: string; name: string }[];
  onSubmit?: (values: EscalateTicketValues) => Promise<void> | void;
}

export function EscalateTicketModal({ open, onOpenChange, ticket, candidates, onSubmit }: EscalateTicketModalProps) {
  const [assignee, setAssignee] = React.useState<string>("");
  const [priority, setPriority] = React.useState<TicketPriority>("P1");
  const [reason, setReason] = React.useState("");

  React.useEffect(() => {
    if (open && ticket) {
      setAssignee(ticket.assigneeId ?? "");
      setPriority(ticket.priority);
      setReason("");
    }
  }, [open, ticket]);

  if (!ticket) return null;

  const dirty = priority !== ticket.priority || assignee !== (ticket.assigneeId ?? "") || reason.length > 0;

  async function submit() {
    if (!reason.trim() || !ticket) return;
    await onSubmit?.({
      ticketId: ticket.id,
      newAssigneeId: assignee || null,
      newPriority: priority,
      reason: reason.trim(),
    });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" dirty={dirty} ariaLabel="Escalate ticket">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="17 11 12 6 7 11" />
            <polyline points="17 18 12 13 7 18" />
          </svg>
        }
        glyphTone="warn"
        title={`Escalate ${ticket.ref}?`}
        description="Reassign + bump priority. The new assignee gets a mobile push; the previous assignee sees a hand-off note."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">New assignee</label>
          <select className="select" value={assignee} onChange={(e) => setAssignee(e.target.value)}>
            <option value="">Unassign</option>
            {candidates.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="field">
          <label className="field-label">New priority</label>
          <select className="select" value={priority} onChange={(e) => setPriority(e.target.value as TicketPriority)}>
            <option value="P0">P0 · urgent</option>
            <option value="P1">P1 · high</option>
            <option value="P2">P2 · normal</option>
            <option value="P3">P3 · low</option>
          </select>
        </div>
        <div className="field">
          <label className="field-label">Reason</label>
          <textarea className="textarea" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why is this being escalated?" />
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!reason.trim()}>
          Escalate
        </button>
      </ModalFooter>
    </Modal>
  );
}
