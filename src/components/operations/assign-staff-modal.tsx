"use client";

import * as React from "react";
import { Modal, ModalHeader, ModalBody, ModalFooter } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-04 — AssignStaffModal.
 *
 * Form-sm typeahead. **Cross-cabinet reusable** — also wired from
 * Bookings arrival prep + Owners villa staff list.
 */

export interface AssignStaffModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What we're assigning (e.g. "Ticket TKT-1041" or "EV-07 turnover"). */
  subjectLabel: string;
  /** Candidate staff list, ideally pre-filtered by skill + availability. */
  candidates: { id: string; name: string; role?: string; available?: boolean }[];
  currentAssigneeId?: string | null;
  onSubmit?: (staffId: string) => Promise<void> | void;
}

export function AssignStaffModal({
  open,
  onOpenChange,
  subjectLabel,
  candidates,
  currentAssigneeId,
  onSubmit,
}: AssignStaffModalProps) {
  const [query, setQuery] = React.useState("");
  const [picked, setPicked] = React.useState<string>(currentAssigneeId ?? "");

  React.useEffect(() => {
    if (open) {
      setQuery("");
      setPicked(currentAssigneeId ?? "");
    }
  }, [open, currentAssigneeId]);

  const filtered = candidates.filter((c) =>
    c.name.toLowerCase().includes(query.toLowerCase()),
  );

  async function submit() {
    if (!picked) return;
    await onSubmit?.(picked);
    onOpenChange(false);
  }

  return (
    <Modal open={open} onOpenChange={onOpenChange} size="sm" dirty={picked !== (currentAssigneeId ?? "")} ariaLabel="Assign staff">
      <ModalHeader
        glyph={
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="8" r="4" />
            <path d="M4 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" />
          </svg>
        }
        glyphTone="accent"
        title="Assign staff"
        description={subjectLabel}
        onClose={() => onOpenChange(false)}
      />
      <ModalBody>
        <div className="field">
          <input
            className="input"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name…"
            autoFocus
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 240, overflow: "auto", border: "1px solid var(--line)", borderRadius: 8, padding: 6 }}>
          {filtered.length === 0 ? (
            <span style={{ color: "var(--ink-3)", fontSize: 13, padding: 8 }}>No matches</span>
          ) : (
            filtered.map((c) => (
              <label
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 6,
                  background: picked === c.id ? "var(--cream-warm, var(--bg-2))" : "transparent",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="staff"
                  checked={picked === c.id}
                  onChange={() => setPicked(c.id)}
                />
                <span style={{ flex: 1 }}>
                  {c.name}
                  {c.role && <span style={{ marginLeft: 6, color: "var(--ink-3)" }}>· {c.role}</span>}
                </span>
                {c.available === false && (
                  <span style={{ fontSize: 10, color: "var(--warn)" }}>BUSY</span>
                )}
              </label>
            ))
          )}
        </div>
      </ModalBody>
      <ModalFooter>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => onOpenChange(false)}>
          Cancel
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={submit} disabled={!picked}>
          Assign
        </button>
      </ModalFooter>
    </Modal>
  );
}
