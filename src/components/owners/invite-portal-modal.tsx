"use client";

import * as React from "react";
import { ConfirmModal } from "@/components/ui/modal";

/**
 * Phase 2.2 mgmt-03 — InvitePortalModal.
 *
 * Form-sm. Confirm + optional personal note. Server action sends
 * the magic-link in 2.2 data; today the modal just resolves.
 */

export interface InvitePortalModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ownerName: string;
  ownerEmail: string;
  onConfirm?: (note: string) => Promise<void> | void;
}

export function InvitePortalModal({
  open,
  onOpenChange,
  ownerName,
  ownerEmail,
  onConfirm,
}: InvitePortalModalProps) {
  const [note, setNote] = React.useState("");
  React.useEffect(() => {
    if (!open) setNote("");
  }, [open]);

  return (
    <ConfirmModal
      open={open}
      onOpenChange={onOpenChange}
      title={`Invite ${ownerName} to the portal?`}
      body={
        <>
          <p style={{ margin: "4px 0 8px", fontSize: 13, color: "var(--ink-3)" }}>
            Magic-link arrives at <b style={{ color: "var(--ink)" }}>{ownerEmail}</b>.
            They can view statements, payouts, and villa schedules through the portal.
          </p>
          <label style={{ display: "block", fontSize: 12, color: "var(--ink-3)", marginBottom: 4 }}>
            Personal note (optional)
          </label>
          <textarea className="textarea" rows={3} value={note} onChange={(e) => setNote(e.target.value)} />
        </>
      }
      confirmLabel="Send invitation"
      onConfirm={async () => {
        await onConfirm?.(note.trim());
      }}
    />
  );
}
