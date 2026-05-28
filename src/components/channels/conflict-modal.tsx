"use client";

/**
 * Phase 2.4 mgmt-01 — ConflictModal.
 *
 * 3-way conflict resolver UI on top of Radix Dialog. Built as a
 * DestructiveConfirmModal-style shell because the wrong choice
 * here either overrides a guest-facing rate or pauses inventory —
 * so default focus is the Cancel button.
 *
 * Composition: outer modal + 3 radio choices (accept-channel /
 * force-ours / flag-and-pause) + optional note (required for
 * flag-and-pause).
 */

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";
import type { ConflictResolution } from "@/features/channels/conflict-resolver";

export interface ConflictModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  villaCode: string;
  channelLabel: string;
  date: string;
  ourValue: number;
  channelValue: number;
  onResolve?: (resolution: ConflictResolution, note?: string) => Promise<void> | void;
}

const CHOICES: { value: ConflictResolution; label: string; sub: string }[] = [
  { value: "accept-channel", label: "Accept channel value", sub: "We adopt theirs. Cell goes synced." },
  { value: "force-ours", label: "Force our value", sub: "Retry-push our value. Risk: channel keeps drifting." },
  { value: "flag-and-pause", label: "Flag & pause inventory", sub: "Blocks the cell + opens P1 ticket. Use only if both values are suspect." },
];

export function ConflictModal({
  open,
  onOpenChange,
  villaCode,
  channelLabel,
  date,
  ourValue,
  channelValue,
  onResolve,
}: ConflictModalProps) {
  const [resolution, setResolution] = React.useState<ConflictResolution>("accept-channel");
  const [note, setNote] = React.useState("");
  const cancelRef = React.useRef<HTMLButtonElement>(null);
  const dirty = note.length > 0 || resolution !== "accept-channel";

  React.useEffect(() => {
    if (!open) {
      setResolution("accept-channel");
      setNote("");
    } else {
      // Default focus on Cancel — wrong choice here either overrides a
      // guest-facing rate or pauses inventory.
      const t = setTimeout(() => cancelRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
  }, [open]);

  const requiresNote = resolution === "flag-and-pause";
  const canSubmit = !requiresNote || note.trim().length >= 8;

  async function submit() {
    if (!canSubmit) return;
    await onResolve?.(resolution, note.trim() || undefined);
    onOpenChange(false);
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      size="md"
      dirty={dirty}
      ariaLabel="Resolve channel conflict"
    >
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        }
        glyphTone="warn"
        title={`Conflict on ${villaCode} · ${channelLabel} · ${date}`}
        description={
          <>
            Our value <strong>{ourValue.toLocaleString()}</strong> · their value <strong>{channelValue.toLocaleString()}</strong>. Pick a resolution — default is Cancel.
          </>
        }
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Resolution</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {CHOICES.map((c) => (
              <label
                key={c.value}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  cursor: "pointer",
                  background: resolution === c.value ? "var(--cream-warm, var(--bg-2))" : "transparent",
                  border: "1px solid",
                  borderColor: resolution === c.value ? "var(--ink-3)" : "var(--line)",
                }}
              >
                <input
                  type="radio"
                  name="conflict-resolution"
                  checked={resolution === c.value}
                  onChange={() => setResolution(c.value)}
                  style={{ marginTop: 2 }}
                />
                <div>
                  <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 500 }}>{c.label}</div>
                  <div style={{ fontSize: 12, color: "var(--ink-3)", marginTop: 2 }}>{c.sub}</div>
                </div>
              </label>
            ))}
          </div>
        </div>
        {requiresNote && (
          <div className="field">
            <label className="field-label">Why pause? (≥ 8 chars, becomes the ticket title)</label>
            <textarea
              className="textarea"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="e.g. Airbnb price-floor rule triggered; verifying with revenue mgr"
            />
          </div>
        )}
      </ModalBody>
      <ModalFooter help="Cancel is the safe default — review with revenue manager if unsure.">
        <button
          ref={cancelRef}
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={() => onOpenChange(false)}
        >
          Cancel
        </button>
        <button
          type="button"
          className={`btn btn-sm ${resolution === "flag-and-pause" ? "btn-danger" : "btn-primary"}`}
          onClick={submit}
          disabled={!canSubmit}
        >
          Apply resolution
        </button>
      </ModalFooter>
    </Modal>
  );
}
