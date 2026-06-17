"use client";

/**
 * "New structure" create form. Captures the SPV/JV/partnership header + its
 * shareholders (which must sum to exactly 100% — enforced client-side for a
 * fast error, and again by the DB trigger at COMMIT). Wires
 * createCompanyStructureAction.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  createCompanyStructureAction,
  type ShareholderInput,
} from "./_actions";

const STRUCTURE_TYPES = [
  "arconique_owned",
  "klr_real_estate",
  "new_spv",
  "joint_venture",
  "landowner_partnership",
  "nominee_structure",
  "custom",
] as const;

const SHAREHOLDER_TYPES = [
  "arconique",
  "investor",
  "klr_real_estate",
  "land_owner",
  "external_party",
] as const;

const REG_STATUSES = [
  "planned",
  "in_progress",
  "registered",
  "dissolved",
  "on_hold",
] as const;

type Row = {
  shareholderType: (typeof SHAREHOLDER_TYPES)[number];
  displayName: string;
  ownershipPercentage: string;
  roleInCompany: string;
  isManagingParty: boolean;
};

function blankRow(): Row {
  return {
    shareholderType: "arconique",
    displayName: "",
    ownershipPercentage: "",
    roleInCompany: "",
    isManagingParty: false,
  };
}

export function NewStructure({
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

  const [structureLabel, setStructureLabel] = React.useState("");
  const [structureType, setStructureType] =
    React.useState<(typeof STRUCTURE_TYPES)[number]>("new_spv");
  const [companyName, setCompanyName] = React.useState("");
  const [country, setCountry] = React.useState("");
  const [registrationStatus, setRegistrationStatus] =
    React.useState<(typeof REG_STATUSES)[number]>("planned");
  const [rows, setRows] = React.useState<Row[]>([blankRow()]);

  const sumPct = rows.reduce(
    (acc, r) => acc + (Number(r.ownershipPercentage) || 0),
    0,
  );

  function updateRow(i: number, patch: Partial<Row>) {
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!structureLabel.trim()) {
      setError("A structure label is required.");
      return;
    }
    if (rows.some((r) => !r.displayName.trim())) {
      setError("Every shareholder needs a display name.");
      return;
    }
    if (Math.abs(sumPct - 100) > 0.001) {
      setError(`Shareholder ownership must sum to 100% (currently ${sumPct.toFixed(2)}%).`);
      return;
    }
    const shareholders: ShareholderInput[] = rows.map((r) => ({
      shareholderType: r.shareholderType,
      displayName: r.displayName.trim(),
      ownershipPercentage: Number(r.ownershipPercentage),
      roleInCompany: r.roleInCompany.trim() || null,
      isManagingParty: r.isManagingParty,
    }));
    start(async () => {
      const res = await createCompanyStructureAction({
        projectId,
        slug,
        structureLabel: structureLabel.trim(),
        structureType,
        companyName,
        country,
        registrationStatus,
        shareholders,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push(`/development-os/projects/${slug}/company/${res.id}`);
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-dark btn-sm"
      >
        + New structure
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded border border-line-soft bg-surface p-3 space-y-3 max-w-3xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <label className="block text-sm">
          <span className="text-ink-secondary">Structure label</span>
          <input
            type="text"
            value={structureLabel}
            onChange={(e) => setStructureLabel(e.target.value)}
            placeholder="Villa Cluster A SPV"
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Structure type</span>
          <select
            value={structureType}
            onChange={(e) =>
              setStructureType(e.target.value as (typeof STRUCTURE_TYPES)[number])
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {STRUCTURE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Company name</span>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Country</span>
          <input
            type="text"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          />
        </label>
        <label className="block text-sm">
          <span className="text-ink-secondary">Registration status</span>
          <select
            value={registrationStatus}
            onChange={(e) =>
              setRegistrationStatus(e.target.value as (typeof REG_STATUSES)[number])
            }
            className="mt-1 block w-full rounded border border-line-soft p-2 text-sm"
          >
            {REG_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-ink-secondary">
            Shareholders · sum{" "}
            <span
              className={
                Math.abs(sumPct - 100) > 0.001 ? "text-danger" : "text-success"
              }
            >
              {sumPct.toFixed(2)}%
            </span>
          </span>
          <button
            type="button"
            onClick={() => setRows((rs) => [...rs, blankRow()])}
            className="btn btn-secondary btn-sm"
          >
            + Add shareholder
          </button>
        </div>
        <div className="space-y-2">
          {rows.map((r, i) => (
            <div
              key={i}
              className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end border border-line-soft rounded p-2"
            >
              <label className="block text-xs md:col-span-3">
                <span className="text-ink-secondary">Type</span>
                <select
                  value={r.shareholderType}
                  onChange={(e) =>
                    updateRow(i, {
                      shareholderType: e.target
                        .value as (typeof SHAREHOLDER_TYPES)[number],
                    })
                  }
                  className="mt-1 block w-full rounded border border-line-soft p-1.5 text-xs"
                >
                  {SHAREHOLDER_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, " ")}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block text-xs md:col-span-3">
                <span className="text-ink-secondary">Display name</span>
                <input
                  type="text"
                  value={r.displayName}
                  onChange={(e) => updateRow(i, { displayName: e.target.value })}
                  className="mt-1 block w-full rounded border border-line-soft p-1.5 text-xs"
                />
              </label>
              <label className="block text-xs md:col-span-2">
                <span className="text-ink-secondary">Ownership %</span>
                <input
                  type="number"
                  min={0}
                  max={100}
                  step="0.01"
                  value={r.ownershipPercentage}
                  onChange={(e) =>
                    updateRow(i, { ownershipPercentage: e.target.value })
                  }
                  className="mt-1 block w-full rounded border border-line-soft p-1.5 text-xs font-mono text-right"
                />
              </label>
              <label className="block text-xs md:col-span-2">
                <span className="text-ink-secondary">Role</span>
                <input
                  type="text"
                  value={r.roleInCompany}
                  onChange={(e) =>
                    updateRow(i, { roleInCompany: e.target.value })
                  }
                  className="mt-1 block w-full rounded border border-line-soft p-1.5 text-xs"
                />
              </label>
              <label className="flex items-center gap-1 text-xs md:col-span-1">
                <input
                  type="checkbox"
                  checked={r.isManagingParty}
                  onChange={(e) =>
                    updateRow(i, { isManagingParty: e.target.checked })
                  }
                />
                <span className="text-ink-secondary">Mng</span>
              </label>
              <div className="md:col-span-1">
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() =>
                      setRows((rs) => rs.filter((_, idx) => idx !== i))
                    }
                    className="text-[11px] px-2 py-1 rounded border border-danger/40 text-danger hover:bg-danger/5"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
          {pending ? "Saving…" : "Create structure"}
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
