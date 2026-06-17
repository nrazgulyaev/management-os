"use client";

/**
 * Residual-unit detail controls — Allocate ownership / Transfer to management
 * / Record sold.
 *
 * Posts to the "use server" adapters in ../_actions.ts, which wrap the
 * org-scoped residual lifecycle actions (residual-actions.ts). No authority
 * is added here; buttons are gated by the unit's status only so we don't post
 * calls the action would reject. The allocate modal supports all four
 * settlement methods:
 *   - manual_override: explicit per-party percentages (must sum to 100).
 *   - by_unrecovered_capital / by_economic_waterfall / by_arconique_25_credit:
 *     capital figures (major USD) for Arconique + each investor; the server
 *     helper computes the ownership split and the DEFERRABLE trigger enforces
 *     sum-to-100% at COMMIT.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { EntityModal } from "@/components/forms/entity-modal";
import { Field, inputCls, selectCls, textareaCls } from "@/components/admin/form-shell";
import {
  allocateResidualOwnershipAction,
  transferResidualUnitToManagementAction,
  recordResidualUnitSoldAction,
} from "../_actions";

const SETTLEMENT_METHODS = [
  { value: "by_unrecovered_capital", label: "By unrecovered capital" },
  { value: "by_economic_waterfall", label: "By economic waterfall" },
  { value: "by_arconique_25_credit", label: "By Arconique 25% credit" },
  { value: "manual_override", label: "Manual override (explicit %)" },
] as const;

export interface ResidualInvestorOption {
  id: string;
  label: string;
}

interface CapitalRow {
  investorId: string;
  capitalMajor: string;
}
interface ManualRow {
  party: string; // "arconique" | investorId
  percentage: string;
}

export function ResidualUnitControls({
  residualUnitId,
  status,
  investors,
}: {
  residualUnitId: string;
  status: string;
  investors: ResidualInvestorOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [error, setError] = React.useState<string | null>(null);

  const [allocOpen, setAllocOpen] = React.useState(false);
  const [soldOpen, setSoldOpen] = React.useState(false);

  // Terminal states — no further lifecycle actions.
  const isTerminal =
    status === "transferred_to_management" || status === "sold_later";

  // ---- Allocate ownership form state ----
  const [method, setMethod] = React.useState<string>("by_unrecovered_capital");
  const [arconiqueCapital, setArconiqueCapital] = React.useState("");
  const [capitalRows, setCapitalRows] = React.useState<CapitalRow[]>([
    { investorId: "", capitalMajor: "" },
  ]);
  const [manualRows, setManualRows] = React.useState<ManualRow[]>([
    { party: "arconique", percentage: "" },
  ]);
  const isManual = method === "manual_override";

  function resetAlloc() {
    setMethod("by_unrecovered_capital");
    setArconiqueCapital("");
    setCapitalRows([{ investorId: "", capitalMajor: "" }]);
    setManualRows([{ party: "arconique", percentage: "" }]);
  }

  const manualSum = manualRows.reduce(
    (acc, r) => acc + (Number(r.percentage) || 0),
    0,
  );

  function submitAllocate() {
    setError(null);
    startTransition(async () => {
      const r = await allocateResidualOwnershipAction(
        isManual
          ? {
              residualUnitId,
              settlementMethod: "manual_override",
              manualShares: manualRows
                .filter((m) => m.percentage.trim() !== "")
                .map((m) => ({
                  arconiqueShare: m.party === "arconique",
                  investorId: m.party === "arconique" ? null : m.party,
                  ownershipPercentage: Number(m.percentage),
                })),
            }
          : {
              residualUnitId,
              settlementMethod: method,
              arconiqueUnrecoveredCapitalMajor: arconiqueCapital,
              investorAllocation: capitalRows
                .filter((c) => c.investorId && c.capitalMajor.trim() !== "")
                .map((c) => ({
                  investorId: c.investorId,
                  unrecoveredCapitalMajor: c.capitalMajor,
                })),
            },
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setAllocOpen(false);
      resetAlloc();
      router.refresh();
    });
  }

  function transfer() {
    setError(null);
    startTransition(async () => {
      const r = await transferResidualUnitToManagementAction(residualUnitId);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      router.refresh();
    });
  }

  function submitSold(formData: FormData) {
    setError(null);
    const soldPriceMajor = String(formData.get("soldPriceMajor") ?? "").trim();
    startTransition(async () => {
      const r = await recordResidualUnitSoldAction(
        residualUnitId,
        soldPriceMajor,
      );
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setSoldOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <Button
        type="button"
        variant="primary"
        size="sm"
        disabled={pending || isTerminal}
        onClick={() => {
          setError(null);
          resetAlloc();
          setAllocOpen(true);
        }}
      >
        Allocate ownership
      </Button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={pending || isTerminal}
        onClick={transfer}
      >
        {pending ? "Working…" : "Transfer to management"}
      </button>
      <button
        type="button"
        className="btn btn-secondary btn-sm"
        disabled={pending || isTerminal}
        onClick={() => {
          setError(null);
          setSoldOpen(true);
        }}
      >
        Record sold
      </button>
      {error && (
        <span className="text-[11px] text-danger self-center">{error}</span>
      )}

      {/* Allocate ownership */}
      <EntityModal
        open={allocOpen}
        onClose={() => setAllocOpen(false)}
        title="Allocate residual ownership"
        size="lg"
      >
        <div className="px-5 md:px-6 py-5 flex flex-col gap-5">
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <Field label="Settlement method" required>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value)}
              className={selectCls}
            >
              {SETTLEMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </Field>

          {isManual ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-secondary">
                Enter explicit ownership percentages. They must sum to exactly
                100% — current total: <strong>{manualSum.toFixed(2)}%</strong>.
              </p>
              {manualRows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2 items-end">
                  <Field label="Party">
                    <select
                      value={row.party}
                      onChange={(e) => {
                        const next = [...manualRows];
                        next[i] = { ...row, party: e.target.value };
                        setManualRows(next);
                      }}
                      className={selectCls}
                    >
                      <option value="arconique">Arconique</option>
                      {investors.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Ownership %">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step="any"
                      value={row.percentage}
                      onChange={(e) => {
                        const next = [...manualRows];
                        next[i] = { ...row, percentage: e.target.value };
                        setManualRows(next);
                      }}
                      className={inputCls}
                    />
                  </Field>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm mb-1"
                    disabled={manualRows.length === 1}
                    onClick={() =>
                      setManualRows(manualRows.filter((_, idx) => idx !== i))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-sm self-start"
                onClick={() =>
                  setManualRows([...manualRows, { party: "arconique", percentage: "" }])
                }
              >
                + Add share
              </button>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink-secondary">
                Enter unrecovered capital (USD) per party. The server computes
                the ownership split for the chosen method.
              </p>
              <Field label="Arconique unrecovered capital (USD)">
                <input
                  type="number"
                  min={0}
                  step="any"
                  value={arconiqueCapital}
                  onChange={(e) => setArconiqueCapital(e.target.value)}
                  placeholder="0"
                  className={inputCls}
                />
              </Field>
              {capitalRows.map((row, i) => (
                <div key={i} className="grid grid-cols-[1fr_160px_auto] gap-2 items-end">
                  <Field label="Investor">
                    <select
                      value={row.investorId}
                      onChange={(e) => {
                        const next = [...capitalRows];
                        next[i] = { ...row, investorId: e.target.value };
                        setCapitalRows(next);
                      }}
                      className={selectCls}
                    >
                      <option value="">Select…</option>
                      {investors.map((inv) => (
                        <option key={inv.id} value={inv.id}>
                          {inv.label}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Unrecovered capital (USD)">
                    <input
                      type="number"
                      min={0}
                      step="any"
                      value={row.capitalMajor}
                      onChange={(e) => {
                        const next = [...capitalRows];
                        next[i] = { ...row, capitalMajor: e.target.value };
                        setCapitalRows(next);
                      }}
                      className={inputCls}
                    />
                  </Field>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm mb-1"
                    disabled={capitalRows.length === 1}
                    onClick={() =>
                      setCapitalRows(capitalRows.filter((_, idx) => idx !== i))
                    }
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="btn btn-secondary btn-sm self-start"
                onClick={() =>
                  setCapitalRows([
                    ...capitalRows,
                    { investorId: "", capitalMajor: "" },
                  ])
                }
              >
                + Add investor
              </button>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setAllocOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="primary"
              onClick={submitAllocate}
              disabled={pending}
            >
              {pending ? "Allocating…" : "Allocate ownership"}
            </Button>
          </div>
        </div>
      </EntityModal>

      {/* Record sold */}
      <EntityModal
        open={soldOpen}
        onClose={() => setSoldOpen(false)}
        title="Record residual unit sold"
        size="sm"
      >
        <form
          action={submitSold}
          className="px-5 md:px-6 py-5 flex flex-col gap-5"
        >
          {error && (
            <div className="rounded-md border border-danger/30 bg-danger-weak/40 px-4 py-2.5 text-sm text-ink">
              {error}
            </div>
          )}
          <Field label="Sold price (USD)" required>
            <input
              name="soldPriceMajor"
              type="number"
              min={0}
              step="any"
              required
              placeholder="480000"
              className={inputCls}
            />
          </Field>
          <div className="flex items-center justify-end gap-3 pt-4 mt-2 border-t border-line-soft -mx-5 md:-mx-6 px-5 md:px-6">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setSoldOpen(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending ? "Recording…" : "Record sold"}
            </Button>
          </div>
        </form>
      </EntityModal>
    </>
  );
}
