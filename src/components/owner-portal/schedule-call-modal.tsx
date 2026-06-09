"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * OWNER-ENGAGEMENT (#168 follow-up) — ScheduleCallModal.
 *
 * Requests a 15-minute quarterly review call with the owner's director.
 * Submits to scheduleQReviewCallAction, which opens a q_review thread
 * seeded with structured scheduling chips the owner then picks from in
 * the inbox. On success the caller routes to that thread.
 */

export interface ScheduleCallModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (topic: string) => Promise<{ ok: boolean; error?: string; threadId?: string }>;
}

export function ScheduleCallModal({ open, onOpenChange, onSubmit }: ScheduleCallModalProps) {
  const [topic, setTopic] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) {
      setTopic("");
      setError(null);
      setBusy(false);
    }
  }, [open]);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    const res = await onSubmit(topic.trim());
    setBusy(false);
    if (res.ok) onOpenChange(false);
    else setError(res.error ?? "Something went wrong.");
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" dirty={topic.length > 0} ariaLabel="Schedule a review call">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
        }
        glyphTone="accent"
        title="Schedule a review call"
        description="A 15-minute call with your director. We'll propose times — pick one in your inbox, or ask for others."
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Anything specific? (optional)</label>
          <textarea
            className="textarea"
            rows={3}
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            placeholder="e.g. Q2 performance, the upcoming maintenance, tax season prep…"
            maxLength={400}
          />
        </div>
        {error && (
          <p className="text-xs text-terra" role="alert">{error}</p>
        )}
      </ModalBody>
      <ModalFooter help="Times land in your inbox">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={busy}>
          {busy ? "Requesting…" : "Request call"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
