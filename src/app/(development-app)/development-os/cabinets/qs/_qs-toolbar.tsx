"use client";

/**
 * P1 — QS-desk toolbar actions (Export XLSX / Compare REV / + Change order).
 *
 * Replaces the three previously-disabled toolbar buttons with real
 * handlers. Styling stays on the handoff `.btn` system so it matches the
 * surrounding cabinet (no Layer-A Button primitive here — this page is a
 * handoff-ported surface that renders the `.btn` CSS classes).
 *
 *   - Export XLSX → GET /development-os/cabinets/qs/export?doc=<id>
 *                   (CSV download; opens in Excel/Sheets/Numbers).
 *   - Compare REV → modal: pick two revisions → diffBoqRevisions().
 *   - + Change order → modal: createChangeOrder() against a revision's
 *                   project (reuses the existing /change-orders action).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Modal,
  ModalHeader,
  ModalBody,
  ModalFooter,
} from "@/components/ui/modal";
import { createChangeOrder } from "@/lib/development/server/change-orders/change-order-actions";
import { compareBoqRevisions } from "@/lib/development/server/boq/boq-actions";
import type { BoqRevisionDiff } from "@/lib/development/server/cabinets/qs-cabinet-queries";

export interface QsRevisionOption {
  documentId: string;
  boqCode: string;
  title: string;
  versionLabel: string;
  projectId: string;
  currency: string;
}

const INIT_TYPES = [
  "arconique_internal",
  "buyer_request",
  "investor_request",
  "vendor_proposed",
  "regulatory",
  "design_correction",
  "site_condition",
] as const;

function fmtMinor(minor: number, currency: string): string {
  return `${(minor / 100).toLocaleString()} ${currency}`;
}

export function QsToolbar({ revisions }: { revisions: QsRevisionOption[] }) {
  const router = useRouter();
  const [compareOpen, setCompareOpen] = React.useState(false);
  const [coOpen, setCoOpen] = React.useState(false);

  const hasRevisions = revisions.length > 0;
  const defaultDoc = revisions[0]?.documentId ?? "";

  return (
    <>
      <a
        className={
          "btn btn-dark btn-sm" +
          (hasRevisions ? "" : " opacity-55 cursor-not-allowed pointer-events-none")
        }
        href={
          hasRevisions
            ? `/development-os/cabinets/qs/export?doc=${encodeURIComponent(defaultDoc)}`
            : undefined
        }
        aria-disabled={!hasRevisions}
        title={hasRevisions ? "Download the latest revision as CSV" : "No BOQ revisions yet"}
      >
        Export XLSX ↓
      </a>
      <button
        type="button"
        className={
          "btn btn-dark btn-sm" +
          (revisions.length >= 2 ? "" : " opacity-55 cursor-not-allowed")
        }
        disabled={revisions.length < 2}
        onClick={() => setCompareOpen(true)}
        title={
          revisions.length >= 2
            ? "Diff two BOQ revisions"
            : "Need at least two revisions to compare"
        }
      >
        Compare REV
      </button>
      <button
        type="button"
        className={
          "btn btn-amber btn-sm" +
          (hasRevisions ? "" : " opacity-55 cursor-not-allowed")
        }
        disabled={!hasRevisions}
        onClick={() => setCoOpen(true)}
        title={hasRevisions ? "Raise a change order" : "No project to attach a change order to"}
      >
        + Change order
      </button>

      {compareOpen && (
        <CompareRevModal
          revisions={revisions}
          onClose={() => setCompareOpen(false)}
        />
      )}
      {coOpen && (
        <ChangeOrderModal
          revisions={revisions}
          onClose={() => setCoOpen(false)}
          onCreated={() => {
            setCoOpen(false);
            router.refresh();
          }}
        />
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Compare REV — pick two revisions, diff their line totals.
// ---------------------------------------------------------------------------

function CompareRevModal({
  revisions,
  onClose,
}: {
  revisions: QsRevisionOption[];
  onClose: () => void;
}) {
  const [aId, setAId] = React.useState(revisions[1]?.documentId ?? "");
  const [bId, setBId] = React.useState(revisions[0]?.documentId ?? "");
  const [diff, setDiff] = React.useState<BoqRevisionDiff | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function run() {
    setError(null);
    if (!aId || !bId) {
      setError("Pick both revisions.");
      return;
    }
    if (aId === bId) {
      setError("Pick two different revisions.");
      return;
    }
    setBusy(true);
    try {
      const out = await compareBoqRevisions({ docAId: aId, docBId: bId });
      setDiff(out);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Compare failed");
    } finally {
      setBusy(false);
    }
  }

  const changed = diff
    ? diff.rows.filter((r) => r.status !== "unchanged")
    : [];

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg">
      <ModalHeader
        title="Compare BOQ revisions"
        description="Line-by-line diff keyed on section_code.item_code."
        onClose={onClose}
      />
      <ModalBody>
        <div className="flex flex-wrap gap-3 items-end mb-4">
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-ink-3">Base (A)</span>
            <select
              className="rounded-md border border-line bg-panel px-3 h-9 text-[13px] text-ink min-w-[220px]"
              value={aId}
              onChange={(e) => setAId(e.target.value)}
            >
              {revisions.map((r) => (
                <option key={r.documentId} value={r.documentId}>
                  {r.boqCode} · {r.versionLabel}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-[12px]">
            <span className="text-ink-3">Compare (B)</span>
            <select
              className="rounded-md border border-line bg-panel px-3 h-9 text-[13px] text-ink min-w-[220px]"
              value={bId}
              onChange={(e) => setBId(e.target.value)}
            >
              {revisions.map((r) => (
                <option key={r.documentId} value={r.documentId}>
                  {r.boqCode} · {r.versionLabel}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="btn btn-amber btn-sm"
            onClick={run}
            disabled={busy}
          >
            {busy ? "Diffing…" : "Run diff"}
          </button>
        </div>

        {error && (
          <p role="alert" className="text-[13px] text-danger mb-3">
            {error}
          </p>
        )}

        {diff && (
          <>
            <div className="flex flex-wrap gap-2 mb-3 text-[12px]">
              <span className="badge badge-ok">+{diff.addedCount} added</span>
              <span className="badge badge-danger">
                -{diff.removedCount} removed
              </span>
              <span className="badge badge-warn">
                {diff.changedCount} changed
              </span>
              <span className="badge">
                Δ total {diff.deltaMinor >= 0 ? "+" : ""}
                {fmtMinor(diff.deltaMinor, diff.currency)}
              </span>
            </div>
            {changed.length === 0 ? (
              <p className="text-[13px] text-ink-3 italic m-0">
                No line-level differences between these revisions.
              </p>
            ) : (
              <div className="max-h-[340px] overflow-auto border border-line rounded-[10px]">
                <table className="data">
                  <thead>
                    <tr>
                      <th>Line</th>
                      <th>Description</th>
                      <th>Status</th>
                      <th className="num">A total</th>
                      <th className="num">B total</th>
                      <th className="num">Δ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changed.map((r) => (
                      <tr key={r.lineKey}>
                        <td className="mono text-[11px] text-ink-3">
                          {r.lineKey}
                        </td>
                        <td className="text-[13px]">{r.description}</td>
                        <td>
                          <span
                            className={
                              "badge " +
                              (r.status === "added"
                                ? "badge-ok"
                                : r.status === "removed"
                                  ? "badge-danger"
                                  : "badge-warn")
                            }
                          >
                            {r.status}
                          </span>
                        </td>
                        <td className="num">
                          {r.totalMinorA != null
                            ? fmtMinor(r.totalMinorA, r.currency)
                            : "—"}
                        </td>
                        <td className="num">
                          {r.totalMinorB != null
                            ? fmtMinor(r.totalMinorB, r.currency)
                            : "—"}
                        </td>
                        <td className="num text-ink font-medium">
                          {r.deltaMinor >= 0 ? "+" : ""}
                          {fmtMinor(r.deltaMinor, r.currency)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </ModalBody>
      <ModalFooter>
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          onClick={onClose}
        >
          Close
        </button>
      </ModalFooter>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// + Change order — create a change_order against a revision's project.
// ---------------------------------------------------------------------------

function ChangeOrderModal({
  revisions,
  onClose,
  onCreated,
}: {
  revisions: QsRevisionOption[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [docId, setDocId] = React.useState(revisions[0]?.documentId ?? "");
  const [title, setTitle] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [scope, setScope] = React.useState("");
  const [initiatedBy, setInitiatedBy] =
    React.useState<(typeof INIT_TYPES)[number]>("arconique_internal");
  const [costImpact, setCostImpact] = React.useState("0");
  const [scheduleDays, setScheduleDays] = React.useState("0");
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const rev = revisions.find((r) => r.documentId === docId) ?? null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rev) {
      setError("Pick a revision.");
      return;
    }
    if (!title.trim() || !reason.trim() || !scope.trim()) {
      setError("Title, reason, and scope description are required.");
      return;
    }
    setBusy(true);
    try {
      await createChangeOrder({
        title: title.trim(),
        projectId: rev.projectId,
        initiatedByType: initiatedBy,
        reason: reason.trim(),
        scopeChangeDescription: scope.trim(),
        costImpactMinor: BigInt(Math.round(Number(costImpact || "0") * 100)),
        costImpactCurrency: rev.currency,
        scheduleImpactDays: Math.round(Number(scheduleDays || "0")),
      });
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
      setBusy(false);
    }
  }

  return (
    <Modal open onOpenChange={(o) => !o && onClose()} size="lg" dirty={busy}>
      <ModalHeader
        title="Raise change order"
        description="Lands in 'requested' status — approval flow uses the approval_thresholds matrix."
        onClose={onClose}
      />
      <form onSubmit={submit}>
        <ModalBody>
          <div className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-ink-3">BOQ revision (sets project)</span>
              <select
                className="rounded-md border border-line bg-panel px-3 h-9 text-[13px] text-ink"
                value={docId}
                onChange={(e) => setDocId(e.target.value)}
              >
                {revisions.map((r) => (
                  <option key={r.documentId} value={r.documentId}>
                    {r.boqCode} · {r.versionLabel} · {r.title}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-ink-3">Title</span>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Upgrade roof tile spec to clay"
                className="rounded-md border border-line bg-panel px-3 h-9 text-[13px] text-ink"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-ink-3">Initiator</span>
              <select
                className="rounded-md border border-line bg-panel px-3 h-9 text-[13px] text-ink"
                value={initiatedBy}
                onChange={(e) =>
                  setInitiatedBy(e.target.value as (typeof INIT_TYPES)[number])
                }
              >
                {INIT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.replace(/_/g, " ")}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-ink-3">Reason</span>
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                rows={2}
                placeholder="Why is this change being requested?"
                className="rounded-md border border-line bg-panel px-3 py-2 text-[13px] text-ink"
                required
              />
            </label>
            <label className="flex flex-col gap-1 text-[12px]">
              <span className="text-ink-3">Scope change description</span>
              <textarea
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                rows={3}
                placeholder="What exactly changes? Drawings, materials, deliverables…"
                className="rounded-md border border-line bg-panel px-3 py-2 text-[13px] text-ink"
                required
              />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className="flex flex-col gap-1 text-[12px]">
                <span className="text-ink-3">
                  Cost impact ({rev?.currency ?? "IDR"}, ± allowed)
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={costImpact}
                  onChange={(e) => setCostImpact(e.target.value)}
                  className="rounded-md border border-line bg-panel px-3 h-9 text-[13px] text-ink font-mono"
                />
              </label>
              <label className="flex flex-col gap-1 text-[12px]">
                <span className="text-ink-3">Schedule impact (days, ±)</span>
                <input
                  type="number"
                  step="1"
                  value={scheduleDays}
                  onChange={(e) => setScheduleDays(e.target.value)}
                  className="rounded-md border border-line bg-panel px-3 h-9 text-[13px] text-ink font-mono"
                />
              </label>
            </div>
            {error && (
              <p role="alert" className="text-[13px] text-danger m-0">
                {error}
              </p>
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button type="submit" className="btn btn-amber btn-sm" disabled={busy}>
            {busy ? "Submitting…" : "Submit change order"}
          </button>
        </ModalFooter>
      </form>
    </Modal>
  );
}
