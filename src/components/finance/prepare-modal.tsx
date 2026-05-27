"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-02 — PrepareStatementsModal.
 *
 * Form-md. Operator picks a period + a villa subset and the
 * statement-preparer agent kicks off. The runtime estimate is
 * synthesized client-side until the agent reports back in 2.2 data.
 */

export interface PrepareValues {
  period: string;
  villaIds: string[];
}

export interface PrepareStatementsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  villas: { id: string; label: string }[];
  defaultPeriod: string;
  onSubmit?: (values: PrepareValues) => Promise<void> | void;
}

export function PrepareStatementsModal({
  open,
  onOpenChange,
  villas,
  defaultPeriod,
  onSubmit,
}: PrepareStatementsModalProps) {
  const [period, setPeriod] = React.useState(defaultPeriod);
  const [villaIds, setVillaIds] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      setPeriod(defaultPeriod);
      setVillaIds(villas.map((v) => v.id));
    }
  }, [open, defaultPeriod, villas]);

  const estimateSeconds = Math.max(15, villaIds.length * 8);

  async function submit() {
    if (villaIds.length === 0) return;
    await onSubmit?.({ period, villaIds });
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="md" dirty={villaIds.length !== villas.length} ariaLabel="Prepare statements">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
            <line x1="9" y1="13" x2="15" y2="13" />
            <line x1="9" y1="17" x2="13" y2="17" />
          </svg>
        }
        glyphTone="accent"
        title="Prepare statements"
        description={`The statement-preparer agent drafts one statement per villa for ${period}.`}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <label className="field-label">Period</label>
          <input
            className="input mono"
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
        <div className="field">
          <label className="field-label">Villas ({villaIds.length} selected)</label>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 220, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 8 }}>
            {villas.map((v) => (
              <label key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, padding: "3px 6px", borderRadius: 4 }}>
                <input
                  type="checkbox"
                  checked={villaIds.includes(v.id)}
                  onChange={() =>
                    setVillaIds((p) =>
                      p.includes(v.id) ? p.filter((x) => x !== v.id) : [...p, v.id],
                    )
                  }
                />
                <span style={{ flex: 1 }}>{v.label}</span>
              </label>
            ))}
          </div>
        </div>
        <div className="field-help">
          Estimated runtime: ~{estimateSeconds}s · agent queued behind any current jobs.
        </div>
      </ModalBody>
      <ModalFooter help="⌘ + Enter to queue">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={villaIds.length === 0}>
          Queue {villaIds.length} statement{villaIds.length === 1 ? "" : "s"}
        </button>
      </ModalFooter>
    </Modal>
  );
}
