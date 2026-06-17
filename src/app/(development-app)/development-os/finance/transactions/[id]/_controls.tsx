"use client";

/**
 * Wave D — inline-edit drawer for a transaction.
 *
 * Replaces the read-only JSON dump + "drawer forthcoming" note with real
 * controls calling the org-scoped reconcile / allocation-split /
 * link-to-commitment server actions via the co-located _actions adapter.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  reconcileTransactionAction,
  splitAllocationAction,
  linkCommitmentAction,
} from "./_actions";

export interface ProjectOption {
  id: string;
  name: string;
}

export interface CommitmentOption {
  id: string;
  label: string;
}

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm text-ink";

export function TransactionEditControls({
  transactionId,
  reconciled,
  currentAllocation,
  currentCommitmentId,
  projects,
  commitments,
}: {
  transactionId: string;
  reconciled: boolean;
  /** Existing allocation ratios keyed by projectId, if multi-project. */
  currentAllocation: Record<string, number> | null;
  currentCommitmentId: string | null;
  projects: ProjectOption[];
  commitments: CommitmentOption[];
}) {
  const [drawer, setDrawer] = React.useState<
    null | "reconcile" | "split" | "link"
  >(null);

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      <Button
        type="button"
        variant="secondary"
        onClick={() => setDrawer("reconcile")}
      >
        {reconciled ? "Re-reconcile" : "Reconcile"}
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setDrawer("split")}
      >
        Split allocation
      </Button>
      <Button
        type="button"
        variant="secondary"
        onClick={() => setDrawer("link")}
      >
        {currentCommitmentId ? "Re-link commitment" : "Link to commitment"}
      </Button>

      {drawer === "reconcile" && (
        <ReconcileDrawer
          transactionId={transactionId}
          onClose={() => setDrawer(null)}
        />
      )}
      {drawer === "split" && (
        <SplitDrawer
          transactionId={transactionId}
          currentAllocation={currentAllocation}
          projects={projects}
          onClose={() => setDrawer(null)}
        />
      )}
      {drawer === "link" && (
        <LinkDrawer
          transactionId={transactionId}
          currentCommitmentId={currentCommitmentId}
          commitments={commitments}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  );
}

function DrawerShell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-ink-tertiary hover:text-ink"
            aria-label="Close"
          >
            <X className="w-4 h-4" strokeWidth={1.75} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ErrorNote({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
      {error}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Reconcile
// ---------------------------------------------------------------------------

function ReconcileDrawer({
  transactionId,
  onClose,
}: {
  transactionId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [ref, setRef] = React.useState("");
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    if (!ref.trim()) {
      setErr("Enter the bank statement line reference.");
      return;
    }
    start(async () => {
      const r = await reconcileTransactionAction(transactionId, ref.trim());
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <DrawerShell title="Reconcile transaction" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <label className="flex flex-col gap-1 text-xs text-ink-secondary">
          Bank statement line ref
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            className={inputCls}
            placeholder="e.g. BCA-2026-04-12-0042"
          />
        </label>
        <p className="text-xs text-ink-tertiary">
          Stamps the transaction as reconciled with this statement line and
          the current timestamp.
        </p>
        <ErrorNote error={err} />
        <DrawerFooter pending={pending} onClose={onClose} submitLabel="Reconcile" />
      </form>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Allocation split
// ---------------------------------------------------------------------------

function SplitDrawer({
  transactionId,
  currentAllocation,
  projects,
  onClose,
}: {
  transactionId: string;
  currentAllocation: Record<string, number> | null;
  projects: ProjectOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);
  // rows: [{ projectId, ratio }]; seed from existing allocation if present.
  const [rows, setRows] = React.useState<{ projectId: string; ratio: string }[]>(
    () => {
      const seeded = currentAllocation
        ? Object.entries(currentAllocation).map(([projectId, ratio]) => ({
            projectId,
            ratio: String(ratio),
          }))
        : [];
      return seeded.length > 0
        ? seeded
        : [
            { projectId: "", ratio: "" },
            { projectId: "", ratio: "" },
          ];
    },
  );

  const sum = rows.reduce((a, r) => a + (Number(r.ratio) || 0), 0);

  function setRow(i: number, patch: Partial<{ projectId: string; ratio: string }>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function addRow() {
    setRows((prev) => [...prev, { projectId: "", ratio: "" }]);
  }
  function removeRow(i: number) {
    setRows((prev) => prev.filter((_, idx) => idx !== i));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    const map: Record<string, number> = {};
    for (const r of rows) {
      if (!r.projectId) continue;
      const ratio = Number(r.ratio);
      if (!(ratio > 0)) {
        setErr("Every mapped project needs a ratio greater than 0.");
        return;
      }
      if (map[r.projectId] != null) {
        setErr("Each project can appear only once.");
        return;
      }
      map[r.projectId] = ratio;
    }
    if (Object.keys(map).length < 2) {
      setErr("A split needs at least two projects.");
      return;
    }
    if (Math.abs(sum - 1) > 0.001) {
      setErr(`Ratios must sum to 1.0 (currently ${sum.toFixed(4)}).`);
      return;
    }
    start(async () => {
      const r = await splitAllocationAction(transactionId, map);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <DrawerShell title="Split allocation across projects" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        <p className="text-xs text-ink-tertiary">
          Assign a fraction of this transaction to each project. Ratios must
          sum to 1.0 (e.g. 0.6 + 0.4).
        </p>
        <div className="space-y-2">
          {rows.map((row, i) => (
            <div key={i} className="flex items-center gap-2">
              <select
                value={row.projectId}
                onChange={(e) => setRow(i, { projectId: e.target.value })}
                className={inputCls}
              >
                <option value="">Select project…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="any"
                min={0}
                max={1}
                value={row.ratio}
                onChange={(e) => setRow(i, { ratio: e.target.value })}
                className="w-24 rounded border border-line-soft bg-surface px-2 py-1 text-sm text-ink"
                placeholder="0.5"
              />
              {rows.length > 2 && (
                <button
                  type="button"
                  onClick={() => removeRow(i)}
                  className="text-ink-tertiary hover:text-danger"
                  aria-label="Remove row"
                >
                  <X className="w-4 h-4" strokeWidth={1.75} />
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="flex items-center justify-between text-xs">
          <button
            type="button"
            onClick={addRow}
            className="text-ink-secondary underline hover:text-ink"
          >
            + Add project
          </button>
          <span
            className={
              Math.abs(sum - 1) > 0.001 ? "text-danger" : "text-success"
            }
          >
            Sum: {sum.toFixed(4)}
          </span>
        </div>
        <ErrorNote error={err} />
        <DrawerFooter pending={pending} onClose={onClose} submitLabel="Save split" />
      </form>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------
// Link to commitment
// ---------------------------------------------------------------------------

function LinkDrawer({
  transactionId,
  currentCommitmentId,
  commitments,
  onClose,
}: {
  transactionId: string;
  currentCommitmentId: string | null;
  commitments: CommitmentOption[];
  onClose: () => void;
}) {
  const router = useRouter();
  const [picked, setPicked] = React.useState(currentCommitmentId ?? "");
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    if (!picked) {
      setErr("Pick a commitment to link.");
      return;
    }
    start(async () => {
      const r = await linkCommitmentAction(transactionId, picked);
      if (!r.ok) {
        setErr(r.error);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <DrawerShell title="Link to commitment ledger" onClose={onClose}>
      <form onSubmit={submit} className="space-y-3">
        {commitments.length === 0 ? (
          <p className="text-xs text-ink-tertiary">
            No commitments (purchase orders) on this org yet. Create one in the
            commitments ledger first.
          </p>
        ) : (
          <label className="flex flex-col gap-1 text-xs text-ink-secondary">
            Commitment
            <select
              value={picked}
              onChange={(e) => setPicked(e.target.value)}
              className={inputCls}
            >
              <option value="">Select commitment…</option>
              {commitments.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        )}
        <p className="text-xs text-ink-tertiary">
          Linking a paid outflow lets the ledger recompute that commitment&apos;s
          paid status on the next recorded payment.
        </p>
        <ErrorNote error={err} />
        <DrawerFooter
          pending={pending}
          onClose={onClose}
          submitLabel="Link"
          submitDisabled={commitments.length === 0}
        />
      </form>
    </DrawerShell>
  );
}

// ---------------------------------------------------------------------------

function DrawerFooter({
  pending,
  onClose,
  submitLabel,
  submitDisabled,
}: {
  pending: boolean;
  onClose: () => void;
  submitLabel: string;
  submitDisabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-end gap-2 pt-1">
      <button
        type="button"
        onClick={onClose}
        disabled={pending}
        className="text-sm px-3 py-1.5 rounded border border-line-soft bg-surface hover:bg-muted/50 disabled:opacity-50"
      >
        Cancel
      </button>
      <button
        type="submit"
        disabled={pending || submitDisabled}
        className="inline-flex items-center gap-1.5 text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
      >
        {pending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
        {pending ? "Saving…" : submitLabel}
      </button>
    </div>
  );
}
