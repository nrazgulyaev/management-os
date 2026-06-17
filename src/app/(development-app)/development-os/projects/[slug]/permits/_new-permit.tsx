"use client";

/**
 * "New permit" create form. Wires createPermitAction (which calls the
 * org-scoped, audited createPermit server action). On success it refreshes
 * the permits list in place.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { createPermitAction } from "./_actions";

const PERMIT_TYPES = [
  "pbg",
  "slf",
  "building_license",
  "environmental",
  "zoning_change",
  "business_license",
  "construction_permit",
  "utility_connection",
  "land_use_change",
  "custom",
] as const;

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

export function NewPermit({
  projectId,
  slug,
}: {
  projectId: string;
  slug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [permitType, setPermitType] =
    React.useState<(typeof PERMIT_TYPES)[number]>("pbg");
  const [permitLabel, setPermitLabel] = React.useState("");
  const [status, setStatus] =
    React.useState<(typeof STATUSES)[number]>("planned");
  const [permitNumber, setPermitNumber] = React.useState("");
  const [issuingAuthority, setIssuingAuthority] = React.useState("");
  const [responsiblePerson, setResponsiblePerson] = React.useState("");
  const [targetApprovalDate, setTargetApprovalDate] = React.useState("");
  const [expiresAt, setExpiresAt] = React.useState("");
  const [notes, setNotes] = React.useState("");

  function reset() {
    setPermitType("pbg");
    setPermitLabel("");
    setStatus("planned");
    setPermitNumber("");
    setIssuingAuthority("");
    setResponsiblePerson("");
    setTargetApprovalDate("");
    setExpiresAt("");
    setNotes("");
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!permitLabel.trim()) {
      setError("Label is required.");
      return;
    }
    start(async () => {
      const res = await createPermitAction({
        projectId,
        slug,
        permitType,
        permitLabel: permitLabel.trim(),
        status,
        targetApprovalDate: targetApprovalDate || undefined,
        expiresAt: expiresAt || undefined,
        permitNumber,
        issuingAuthority,
        responsiblePerson,
        notes,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-dark btn-sm"
      >
        + New permit
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded border border-line-soft bg-surface p-3 space-y-3 max-w-2xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Type</span>
          <select
            value={permitType}
            onChange={(e) =>
              setPermitType(e.target.value as (typeof PERMIT_TYPES)[number])
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {PERMIT_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Initial status</span>
          <select
            value={status}
            onChange={(e) =>
              setStatus(e.target.value as (typeof STATUSES)[number])
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-ink-secondary">Label</span>
        <input
          type="text"
          value={permitLabel}
          onChange={(e) => setPermitLabel(e.target.value)}
          placeholder="PBG — Villa cluster A"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          required
        />
      </label>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Permit number</span>
          <input
            type="text"
            value={permitNumber}
            onChange={(e) => setPermitNumber(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Issuing authority</span>
          <input
            type="text"
            value={issuingAuthority}
            onChange={(e) => setIssuingAuthority(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Responsible person</span>
          <input
            type="text"
            value={responsiblePerson}
            onChange={(e) => setResponsiblePerson(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Target approval date</span>
          <input
            type="date"
            value={targetApprovalDate}
            onChange={(e) => setTargetApprovalDate(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Expires at</span>
          <input
            type="date"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-ink-secondary">Notes</span>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
          {pending ? "Saving…" : "Create permit"}
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="btn btn-secondary btn-sm"
        >
          Cancel
        </button>
        {error && <span className="text-xs text-danger">{error}</span>}
      </div>
    </form>
  );
}
