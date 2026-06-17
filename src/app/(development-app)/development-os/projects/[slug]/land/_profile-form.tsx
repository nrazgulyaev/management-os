"use client";

/**
 * Create / edit the land profile for a project. Wires upsertLandProfileAction
 * (org-scoped, audited, ON CONFLICT upsert). Pre-fills from the existing
 * profile when one is present, so the same form serves both empty and
 * populated states. Collapsible so it does not crowd the populated read view.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { upsertLandProfileAction } from "./_profile-form-action";

const ACQUISITION_MODES = [
  "leasehold",
  "freehold",
  "joint_venture",
  "landowner_partnership",
  "nominee",
  "revenue_share",
  "custom",
] as const;

type AcquisitionMode = (typeof ACQUISITION_MODES)[number];

export interface LandProfileInitial {
  acquisitionMode: string;
  acquisitionDate: string | null;
  leaseStartDate: string | null;
  leaseExpiryDate: string | null;
  leaseTenureYears: number | null;
  totalLandSizeSqm: string | null;
  zoningClassification: string | null;
  notes: string | null;
}

export function LandProfileForm({
  projectId,
  initial,
  startOpen,
}: {
  projectId: string;
  initial: LandProfileInitial | null;
  startOpen?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(Boolean(startOpen));
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [acquisitionMode, setAcquisitionMode] = React.useState<AcquisitionMode>(
    (ACQUISITION_MODES.includes(initial?.acquisitionMode as AcquisitionMode)
      ? (initial?.acquisitionMode as AcquisitionMode)
      : "leasehold"),
  );
  const [acquisitionDate, setAcquisitionDate] = React.useState(
    initial?.acquisitionDate ?? "",
  );
  const [leaseStartDate, setLeaseStartDate] = React.useState(
    initial?.leaseStartDate ?? "",
  );
  const [leaseExpiryDate, setLeaseExpiryDate] = React.useState(
    initial?.leaseExpiryDate ?? "",
  );
  const [leaseTenureYears, setLeaseTenureYears] = React.useState(
    initial?.leaseTenureYears != null ? String(initial.leaseTenureYears) : "",
  );
  const [totalLandSizeSqm, setTotalLandSizeSqm] = React.useState(
    initial?.totalLandSizeSqm ?? "",
  );
  const [zoningClassification, setZoningClassification] = React.useState(
    initial?.zoningClassification ?? "",
  );
  const [notes, setNotes] = React.useState(initial?.notes ?? "");

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const tenure = leaseTenureYears ? Number(leaseTenureYears) : undefined;
    if (tenure != null && (!Number.isInteger(tenure) || tenure < 1)) {
      setError("Lease tenure must be a whole number of years (≥ 1).");
      return;
    }
    start(async () => {
      const res = await upsertLandProfileAction({
        projectId,
        acquisitionMode,
        acquisitionDate: acquisitionDate || undefined,
        leaseStartDate: leaseStartDate || undefined,
        leaseExpiryDate: leaseExpiryDate || undefined,
        leaseTenureYears: tenure,
        totalLandSizeSqm: totalLandSizeSqm || undefined,
        zoningClassification: zoningClassification || undefined,
        notes: notes || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
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
        {initial ? "Edit land profile" : "Set up land profile"}
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded border border-line-soft bg-surface p-3 space-y-3 max-w-2xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Acquisition mode</span>
          <select
            value={acquisitionMode}
            onChange={(e) =>
              setAcquisitionMode(e.target.value as AcquisitionMode)
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {ACQUISITION_MODES.map((m) => (
              <option key={m} value={m}>
                {m.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Acquisition date</span>
          <input
            type="date"
            value={acquisitionDate}
            onChange={(e) => setAcquisitionDate(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Total land size (sqm)</span>
          <input
            type="number"
            min={0}
            step="0.01"
            value={totalLandSizeSqm}
            onChange={(e) => setTotalLandSizeSqm(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Lease start</span>
          <input
            type="date"
            value={leaseStartDate}
            onChange={(e) => setLeaseStartDate(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Lease expiry</span>
          <input
            type="date"
            value={leaseExpiryDate}
            onChange={(e) => setLeaseExpiryDate(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Lease tenure (years)</span>
          <input
            type="number"
            min={1}
            max={99}
            step="1"
            value={leaseTenureYears}
            onChange={(e) => setLeaseTenureYears(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm font-mono"
          />
        </label>
      </div>
      <label className="block text-sm">
        <span className="text-ink-secondary">Zoning classification</span>
        <input
          type="text"
          value={zoningClassification}
          onChange={(e) => setZoningClassification(e.target.value)}
          placeholder="Tourism / residential"
          className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
        />
      </label>
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
          {pending ? "Saving…" : initial ? "Save changes" : "Create profile"}
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
