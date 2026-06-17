"use client";

/**
 * Company-structure detail controls: activate this structure (deactivates the
 * project's current active one), add a shareholder, and edit an existing
 * shareholder's ownership %. The sum-to-100% trigger re-validates at COMMIT,
 * so the server may reject an add/edit that breaks the total.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  activateCompanyStructureAction,
  addCompanyShareholderAction,
  updateCompanyShareholderAction,
} from "../_actions";

const SHAREHOLDER_TYPES = [
  "arconique",
  "investor",
  "klr_real_estate",
  "land_owner",
  "external_party",
] as const;

export function ActivateStructure({
  projectId,
  structureId,
  slug,
  isActive,
}: {
  projectId: string;
  structureId: string;
  slug: string;
  isActive: boolean;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  if (isActive) {
    return (
      <span className="text-xs text-ink-tertiary">
        This is the active structure for the project.
      </span>
    );
  }

  function activate() {
    setError(null);
    start(async () => {
      const res = await activateCompanyStructureAction({
        projectId,
        structureId,
        slug,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={activate}
        className="btn btn-dark btn-sm"
      >
        {pending ? "Activating…" : "Make active"}
      </button>
      <span className="text-[11px] text-ink-tertiary">
        Deactivates the project&apos;s current active structure.
      </span>
      {error && <span className="text-xs text-danger">{error}</span>}
    </div>
  );
}

export function AddShareholder({
  structureId,
  slug,
}: {
  structureId: string;
  slug: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [shareholderType, setShareholderType] =
    React.useState<(typeof SHAREHOLDER_TYPES)[number]>("investor");
  const [displayName, setDisplayName] = React.useState("");
  const [ownershipPercentage, setOwnershipPercentage] = React.useState("");
  const [roleInCompany, setRoleInCompany] = React.useState("");
  const [isManagingParty, setIsManagingParty] = React.useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const pct = Number(ownershipPercentage);
    if (!displayName.trim()) {
      setError("Display name is required.");
      return;
    }
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) {
      setError("Ownership % must be between 0 and 100.");
      return;
    }
    start(async () => {
      const res = await addCompanyShareholderAction({
        structureId,
        slug,
        shareholderType,
        displayName: displayName.trim(),
        ownershipPercentage: pct,
        roleInCompany: roleInCompany.trim() || undefined,
        isManagingParty,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setDisplayName("");
      setOwnershipPercentage("");
      setRoleInCompany("");
      setIsManagingParty(false);
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn btn-secondary btn-sm"
      >
        + Add shareholder
      </button>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="rounded border border-line-soft bg-surface p-3 space-y-2 max-w-2xl"
    >
      <div className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end">
        <label className="block text-xs md:col-span-3">
          <span className="text-ink-secondary">Type</span>
          <select
            value={shareholderType}
            onChange={(e) =>
              setShareholderType(
                e.target.value as (typeof SHAREHOLDER_TYPES)[number],
              )
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
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
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
            value={ownershipPercentage}
            onChange={(e) => setOwnershipPercentage(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-1.5 text-xs font-mono text-right"
          />
        </label>
        <label className="block text-xs md:col-span-3">
          <span className="text-ink-secondary">Role</span>
          <input
            type="text"
            value={roleInCompany}
            onChange={(e) => setRoleInCompany(e.target.value)}
            className="mt-1 block w-full rounded border border-line-soft p-1.5 text-xs"
          />
        </label>
        <label className="flex items-center gap-1 text-xs md:col-span-1">
          <input
            type="checkbox"
            checked={isManagingParty}
            onChange={(e) => setIsManagingParty(e.target.checked)}
          />
          <span className="text-ink-secondary">Mng</span>
        </label>
      </div>
      <p className="text-[11px] text-ink-tertiary">
        Ownership across all shareholders must sum to exactly 100% — the add
        will be rejected otherwise. Edit existing rows first if needed.
      </p>
      <div className="flex items-center gap-2">
        <button type="submit" disabled={pending} className="btn btn-dark btn-sm">
          {pending ? "Saving…" : "Add"}
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

export function EditShareholderOwnership({
  shareholderId,
  structureId,
  slug,
  currentPercentage,
  currentRole,
  currentManaging,
}: {
  shareholderId: string;
  structureId: string;
  slug: string;
  currentPercentage: number;
  currentRole: string | null;
  currentManaging: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);
  const [pct, setPct] = React.useState(String(currentPercentage));
  const [role, setRole] = React.useState(currentRole ?? "");
  const [managing, setManaging] = React.useState(currentManaging);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const value = Number(pct);
    if (!Number.isFinite(value) || value <= 0 || value > 100) {
      setError("Ownership % must be between 0 and 100.");
      return;
    }
    start(async () => {
      const res = await updateCompanyShareholderAction({
        shareholderId,
        structureId,
        slug,
        ownershipPercentage: value,
        roleInCompany: role.trim() || null,
        isManagingParty: managing,
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
        className="text-[11px] px-2 py-0.5 rounded border border-line-soft bg-surface hover:bg-muted/50"
      >
        Edit
      </button>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-1.5">
      <input
        type="number"
        min={0}
        max={100}
        step="0.01"
        value={pct}
        onChange={(e) => setPct(e.target.value)}
        className="w-20 text-xs px-1.5 py-0.5 rounded border border-line-soft bg-surface font-mono text-right"
        aria-label="Ownership %"
      />
      <input
        type="text"
        value={role}
        onChange={(e) => setRole(e.target.value)}
        placeholder="Role"
        className="w-28 text-xs px-1.5 py-0.5 rounded border border-line-soft bg-surface"
        aria-label="Role"
      />
      <label className="flex items-center gap-1 text-[11px] text-ink-secondary">
        <input
          type="checkbox"
          checked={managing}
          onChange={(e) => setManaging(e.target.checked)}
        />
        Mng
      </label>
      <button
        type="submit"
        disabled={pending}
        className="text-[11px] px-2 py-0.5 rounded border border-ink/30 bg-surface hover:bg-muted/50 disabled:opacity-50"
      >
        {pending ? "…" : "Save"}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setOpen(false);
          setError(null);
        }}
        className="text-[11px] px-2 py-0.5 rounded border border-line-soft bg-surface hover:bg-muted/40"
      >
        Cancel
      </button>
      {error && <span className="text-[10px] text-danger w-full">{error}</span>}
    </form>
  );
}
