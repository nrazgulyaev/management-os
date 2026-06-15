"use client";

/**
 * Wire-up — director-gated editor island for the approval-thresholds matrix.
 *
 * Renders the matrix table with inline edit + per-row Deactivate, plus an
 * "Add tier" modal. All three buttons post to the "use server" adapters in
 * ./_actions.ts, which wrap the already-authorized CRUD actions (the
 * director-role gate is enforced server-side regardless of this island).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
import {
  createApprovalThresholdAction,
  updateApprovalThresholdAction,
  deactivateApprovalThresholdAction,
  type ThresholdFormInput,
} from "./_actions";

export interface ThresholdRow {
  id: string;
  thresholdType: string;
  amountMinorMin: string;
  amountMinorMax: string | null;
  currency: string;
  requiredRole: string;
  requiredApproverCount: number;
  notes: string | null;
}

const THRESHOLD_TYPES = [
  "purchase_request",
  "change_order",
  "budget_overrun",
  "discount",
  "distribution",
  "capital_call",
  "custom",
] as const;

const REQUIRED_ROLES = [
  "auto_approved",
  "procurement_manager",
  "project_manager",
  "finance_manager",
  "director",
  "investor_approval",
  "reserved_matter",
] as const;

const ROLE_TONE: Record<string, "info" | "ok" | "warn" | "danger" | "soft"> = {
  auto_approved: "ok",
  procurement_manager: "info",
  project_manager: "info",
  finance_manager: "info",
  director: "warn",
  investor_approval: "danger",
  reserved_matter: "danger",
};

const inputCls =
  "w-full rounded border border-line-soft bg-surface px-2 py-1 text-sm";

/** Minor decimals must match the adapter (USDT = 6, fiat = 2). */
function minorDecimals(currency: string): number {
  return currency.toUpperCase() === "USDT" ? 6 : 2;
}

/** minor-unit string → major-unit string for editing/display. */
function minorToMajor(minor: string | null, currency: string): string {
  if (minor == null || minor === "") return "";
  const n = Number(minor);
  if (!Number.isFinite(n)) return "";
  return String(n / 10 ** minorDecimals(currency));
}

function fmtAmount(minor: string | null, currency: string): string {
  if (minor == null) return "no limit";
  const major = Number(minor) / 10 ** minorDecimals(currency);
  return `${currency} ${major.toLocaleString("en-US")}`;
}

type Draft = {
  thresholdType: string;
  amountMinMajor: string;
  amountMaxMajor: string;
  currency: string;
  requiredRole: string;
  requiredApproverCount: string;
  notes: string;
};

function emptyDraft(): Draft {
  return {
    thresholdType: "purchase_request",
    amountMinMajor: "0",
    amountMaxMajor: "",
    currency: "USD",
    requiredRole: "procurement_manager",
    requiredApproverCount: "1",
    notes: "",
  };
}

function rowToDraft(r: ThresholdRow): Draft {
  return {
    thresholdType: r.thresholdType,
    amountMinMajor: minorToMajor(r.amountMinorMin, r.currency),
    amountMaxMajor: minorToMajor(r.amountMinorMax, r.currency),
    currency: r.currency,
    requiredRole: r.requiredRole,
    requiredApproverCount: String(r.requiredApproverCount),
    notes: r.notes ?? "",
  };
}

function draftToInput(d: Draft): ThresholdFormInput {
  return {
    thresholdType: d.thresholdType,
    amountMinMajor: d.amountMinMajor,
    amountMaxMajor: d.amountMaxMajor.trim() === "" ? null : d.amountMaxMajor,
    currency: d.currency,
    requiredRole: d.requiredRole,
    requiredApproverCount: Number(d.requiredApproverCount) || 1,
    notes: d.notes.trim() === "" ? null : d.notes,
  };
}

export function ApprovalMatrixEditor({ rows }: { rows: ThresholdRow[] }) {
  const router = useRouter();
  const [adding, setAdding] = React.useState(false);
  const [editId, setEditId] = React.useState<string | null>(null);

  // Group by threshold type to mirror the read-only layout.
  const byType = new Map<string, ThresholdRow[]>();
  for (const r of rows) {
    const arr = byType.get(r.thresholdType) ?? [];
    arr.push(r);
    byType.set(r.thresholdType, arr);
  }

  return (
    <div>
      <div className="flex justify-end mb-3">
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90"
        >
          Add tier
        </button>
      </div>

      {rows.length === 0 ? (
        <p className="text-[13px] text-ink-3 mb-4">
          No active tiers. Use “Add tier” to configure the matrix.
        </p>
      ) : (
        Array.from(byType.entries()).map(([type, typeRows]) => (
          <div key={type} className="mb-6">
            <div className="label mb-2.5">{type}</div>
            <p className="text-[13px] text-ink-3 mb-2.5">
              {typeRows.length} tier{typeRows.length === 1 ? "" : "s"}
            </p>
            <Table>
              <THead>
                <TR>
                  <TH>Min</TH>
                  <TH>Max</TH>
                  <TH>Currency</TH>
                  <TH>Required role</TH>
                  <TH>Approver count</TH>
                  <TH>Notes</TH>
                  <TH>Actions</TH>
                </TR>
              </THead>
              <TBody>
                {typeRows.map((r) => (
                  <TR key={r.id}>
                    <TDNum>{fmtAmount(r.amountMinorMin, r.currency)}</TDNum>
                    <TDNum>{fmtAmount(r.amountMinorMax, r.currency)}</TDNum>
                    <TD className="text-xs">{r.currency}</TD>
                    <TD>
                      <HandoffBadge tone={ROLE_TONE[r.requiredRole] ?? "soft"}>
                        {r.requiredRole}
                      </HandoffBadge>
                    </TD>
                    <TDNum>{r.requiredApproverCount}</TDNum>
                    <TD className="text-xs">{r.notes ?? "—"}</TD>
                    <TD>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditId(r.id)}
                          className="text-xs px-2 py-1 rounded border border-line-soft bg-surface hover:bg-muted/50"
                        >
                          Edit
                        </button>
                        <DeactivateButton
                          id={r.id}
                          onDone={() => router.refresh()}
                        />
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        ))
      )}

      {adding && (
        <ThresholdModal
          title="Add approval tier"
          initial={emptyDraft()}
          submitLabel="Add tier"
          onClose={() => setAdding(false)}
          onSubmit={async (draft) => {
            const r = await createApprovalThresholdAction(draftToInput(draft));
            if (r.ok) {
              setAdding(false);
              router.refresh();
            }
            return r;
          }}
        />
      )}

      {editId &&
        (() => {
          const row = rows.find((x) => x.id === editId);
          if (!row) return null;
          return (
            <ThresholdModal
              title="Edit approval tier"
              initial={rowToDraft(row)}
              submitLabel="Save changes"
              onClose={() => setEditId(null)}
              onSubmit={async (draft) => {
                const r = await updateApprovalThresholdAction(
                  editId,
                  draftToInput(draft),
                );
                if (r.ok) {
                  setEditId(null);
                  router.refresh();
                }
                return r;
              }}
            />
          );
        })()}
    </div>
  );
}

function DeactivateButton({
  id,
  onDone,
}: {
  id: string;
  onDone: () => void;
}) {
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  return (
    <>
      <button
        type="button"
        disabled={pending}
        onClick={() => {
          setErr(null);
          if (
            !window.confirm(
              "Deactivate this approval tier? It will no longer apply to approvals.",
            )
          )
            return;
          start(async () => {
            const r = await deactivateApprovalThresholdAction(id);
            if (!r.ok) {
              setErr(r.error);
              return;
            }
            onDone();
          });
        }}
        className="text-xs px-2 py-1 rounded border border-line-soft bg-surface text-danger hover:bg-muted/50 disabled:opacity-50"
      >
        {pending ? "…" : "Deactivate"}
      </button>
      {err && <span className="text-[10px] text-danger">{err}</span>}
    </>
  );
}

function ThresholdModal({
  title,
  initial,
  submitLabel,
  onClose,
  onSubmit,
}: {
  title: string;
  initial: Draft;
  submitLabel: string;
  onClose: () => void;
  onSubmit: (
    draft: Draft,
  ) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const [draft, setDraft] = React.useState<Draft>(initial);
  const [pending, start] = React.useTransition();
  const [err, setErr] = React.useState<string | null>(null);

  function set<K extends keyof Draft>(k: K, v: Draft[K]) {
    setDraft((d) => ({ ...d, [k]: v }));
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    start(async () => {
      const r = await onSubmit(draft);
      if (!r.ok) setErr(r.error);
    });
  }

  return (
    <div
      className="modal-overlay flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-lg border border-line-soft bg-surface p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-sm font-semibold mb-3">{title}</h2>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <L label="Threshold type">
              <select
                className={inputCls}
                value={draft.thresholdType}
                onChange={(e) => set("thresholdType", e.target.value)}
              >
                {THRESHOLD_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </L>
            <L label="Required role">
              <select
                className={inputCls}
                value={draft.requiredRole}
                onChange={(e) => set("requiredRole", e.target.value)}
              >
                {REQUIRED_ROLES.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </L>
            <L label="Min amount (major units)">
              <input
                type="number"
                min={0}
                step="any"
                required
                className={inputCls}
                value={draft.amountMinMajor}
                onChange={(e) => set("amountMinMajor", e.target.value)}
              />
            </L>
            <L label="Max amount (blank = no limit)">
              <input
                type="number"
                min={0}
                step="any"
                className={inputCls}
                value={draft.amountMaxMajor}
                onChange={(e) => set("amountMaxMajor", e.target.value)}
                placeholder="no limit"
              />
            </L>
            <L label="Currency (3-letter)">
              <input
                type="text"
                required
                maxLength={3}
                minLength={3}
                className={inputCls}
                value={draft.currency}
                onChange={(e) =>
                  set("currency", e.target.value.toUpperCase())
                }
                placeholder="USD"
              />
            </L>
            <L label="Required approver count">
              <input
                type="number"
                min={1}
                max={10}
                required
                className={inputCls}
                value={draft.requiredApproverCount}
                onChange={(e) =>
                  set("requiredApproverCount", e.target.value)
                }
              />
            </L>
            <L label="Notes" span2>
              <textarea
                className={inputCls}
                rows={2}
                maxLength={500}
                value={draft.notes}
                onChange={(e) => set("notes", e.target.value)}
              />
            </L>
          </div>
          {err && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {err}
            </div>
          )}
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
              disabled={pending}
              className="text-sm px-3 py-1.5 rounded bg-ink text-surface hover:opacity-90 disabled:opacity-50"
            >
              {pending ? "Saving…" : submitLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function L({
  label,
  span2,
  children,
}: {
  label: string;
  span2?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label
      className={`flex flex-col gap-1 text-xs text-ink-secondary ${span2 ? "col-span-2" : ""}`}
    >
      {label}
      {children}
    </label>
  );
}
