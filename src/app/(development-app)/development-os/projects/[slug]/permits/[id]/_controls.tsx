"use client";

/**
 * Permit detail controls — status transition (with received/expiry dates +
 * optional rejection reason) and a document-attach control. Wires the
 * org-scoped transitionPermitStatus / attachPermitDocument server actions via
 * the co-located "use server" adapters.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  transitionPermitStatusAction,
  attachPermitDocumentAction,
} from "../_actions";

const STATUSES = [
  "planned",
  "preparing",
  "submitted",
  "under_review",
  "approved",
  "rejected",
  "expired",
  "renewed",
  "cancelled",
] as const;

type PermitStatus = (typeof STATUSES)[number];

export function PermitStatusControl({
  permitId,
  slug,
  currentStatus,
}: {
  permitId: string;
  slug: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [newStatus, setNewStatus] = React.useState<PermitStatus>(
    (currentStatus as PermitStatus) ?? "planned",
  );
  const [receivedAt, setReceivedAt] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [rejectionReason, setRejectionReason] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (newStatus === "rejected" && !rejectionReason.trim()) {
      setError("A rejection reason is required to reject a permit.");
      return;
    }
    start(async () => {
      const res = await transitionPermitStatusAction({
        permitId,
        slug,
        newStatus,
        receivedAt: receivedAt || undefined,
        expiresAt: expiresAt || undefined,
        rejectionReason:
          newStatus === "rejected" ? rejectionReason : undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-3 max-w-md">
      <label className="block text-sm">
        <span className="text-ink-secondary">Set status</span>
        <select
          value={newStatus}
          onChange={(e) => setNewStatus(e.target.value as PermitStatus)}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Received date</span>
          <input
            type="date"
            value={receivedAt}
            onChange={(e) => setReceivedAt(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Expiry date</span>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
      </div>
      {newStatus === "rejected" && (
        <label className="block text-sm">
          <span className="text-ink-secondary">Rejection reason</span>
          <textarea
            value={rejectionReason}
            onChange={(e) => setRejectionReason(e.target.value)}
            rows={2}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
      )}
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
          {pending ? "Saving…" : "Update status"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}

export function PermitAttachDocument({
  permitId,
  slug,
}: {
  permitId: string;
  slug: string;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [documentId, setDocumentId] = React.useState("");
  const [documentRole, setDocumentRole] = React.useState("");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!documentId.trim()) {
      setError("Enter the document id to attach.");
      return;
    }
    start(async () => {
      const res = await attachPermitDocumentAction({
        permitId,
        slug,
        documentId: documentId.trim(),
        documentRole: documentRole.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDocumentId("");
      setDocumentRole("");
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-2 max-w-md">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
        <label className="block text-sm">
          <span className="text-ink-secondary">Document id (UUID)</span>
          <input
            type="text"
            value={documentId}
            onChange={(e) => setDocumentId(e.target.value)}
            placeholder="00000000-0000-0000-0000-000000000000"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-xs font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Role (optional)</span>
          <input
            type="text"
            value={documentRole}
            onChange={(e) => setDocumentRole(e.target.value)}
            placeholder="approval_letter"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <button
          type="submit"
          disabled={pending}
          className="btn btn-secondary btn-sm"
        >
          {pending ? "Attaching…" : "Attach document"}
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
      <p className="text-[11px] text-ink-tertiary">
        The document must already exist in this org (created in the project
        Documents tab). It is linked by id; cross-org ids are rejected.
      </p>
    </form>
  );
}
