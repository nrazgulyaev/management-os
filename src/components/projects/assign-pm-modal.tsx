"use client";

/**
 * Phase 2.2 dev-01 — AssignPmModal.
 *
 * Form-sm. Single dropdown picker against the org's PM-tagged
 * staff. Submission lands as a server action in the data PR.
 */

import * as React from "react";
import { ConfirmModal } from "@/components/ui/modal";

export interface AssignPmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Candidate PMs (staff with role = project_manager). */
  candidates: { id: string; name: string; subtitle?: string }[];
  currentPmId?: string | null;
  onSubmit?: (pmId: string) => Promise<void> | void;
}

export function AssignPmModal({
  open,
  onOpenChange,
  candidates,
  currentPmId,
  onSubmit,
}: AssignPmModalProps) {
  const [picked, setPicked] = React.useState<string>(currentPmId ?? "");

  React.useEffect(() => {
    if (open) setPicked(currentPmId ?? "");
  }, [open, currentPmId]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title="Assign project manager"
      body={
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
          {candidates.length === 0 ? (
            <span style={{ fontSize: 13, color: "var(--ink-3)" }}>
              No staff with the project_manager role yet — invite one from Settings first.
            </span>
          ) : (
            candidates.map((c) => (
              <label
                key={c.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  fontSize: 13,
                  padding: "6px 8px",
                  borderRadius: 6,
                  background: picked === c.id ? "var(--cream-warm)" : "transparent",
                  cursor: "pointer",
                }}
              >
                <input
                  type="radio"
                  name="pm"
                  checked={picked === c.id}
                  onChange={() => setPicked(c.id)}
                />
                <span style={{ flex: 1 }}>
                  {c.name}
                  {c.subtitle && (
                    <span style={{ marginLeft: 6, color: "var(--ink-3)" }}>· {c.subtitle}</span>
                  )}
                </span>
              </label>
            ))
          )}
        </div>
      }
      confirmLabel="Assign"
      onConfirm={async () => {
        if (!picked) return;
        await onSubmit?.(picked);
      }}
    />
  );
}
