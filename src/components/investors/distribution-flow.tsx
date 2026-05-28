"use client";

/**
 * Phase 2.4 dev-03 — DistributionFlow.
 *
 * 4-step wrapper for /investors/distribution/new:
 *   1. inputs      — total proceeds, period, hold years
 *   2. preview     — DistributionPreviewWaterfall (canonical math)
 *   3. allocations — per-LP table
 *   4. approve     — one-way confirm (Critical UX rule 2)
 *
 * Step 4 is irreversible: locks distributions.payload_json,
 * computes approved_hash (sha-256 of payload + actor + timestamp),
 * queues wires, writes audit, notifies LPs.
 */

import * as React from "react";

export type DistributionStep = "inputs" | "preview" | "allocations" | "approve";

export interface DistributionFlowProps {
  step: DistributionStep;
  onStepChange?: (next: DistributionStep) => void;
  renderInputs: () => React.ReactNode;
  renderPreview: () => React.ReactNode;
  renderAllocations: () => React.ReactNode;
  renderApprove: () => React.ReactNode;
  /** Disable forward nav when inputs are invalid / preview missing. */
  canAdvance?: boolean;
}

const ORDER: DistributionStep[] = ["inputs", "preview", "allocations", "approve"];

const LABEL: Record<DistributionStep, string> = {
  inputs: "Inputs",
  preview: "Preview",
  allocations: "Allocations",
  approve: "Approve",
};

export function DistributionFlow({
  step,
  onStepChange,
  renderInputs,
  renderPreview,
  renderAllocations,
  renderApprove,
  canAdvance = true,
}: DistributionFlowProps) {
  const idx = ORDER.indexOf(step);
  const next = ORDER[idx + 1];
  const prev = ORDER[idx - 1];

  const body =
    step === "inputs"
      ? renderInputs()
      : step === "preview"
        ? renderPreview()
        : step === "allocations"
          ? renderAllocations()
          : renderApprove();

  return (
    <div className="distribution-flow">
      <ol className="df-steps mono">
        {ORDER.map((s, i) => (
          <li key={s} className={`${i < idx ? "is-done" : ""}${s === step ? " is-on" : ""}`}>
            {i + 1} · {LABEL[s]}
          </li>
        ))}
      </ol>
      <div className="df-body">{body}</div>
      <footer className="df-foot">
        <button
          type="button"
          className="btn btn-secondary btn-sm"
          disabled={!prev}
          onClick={() => prev && onStepChange?.(prev)}
        >
          Back
        </button>
        {next ? (
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={!canAdvance}
            onClick={() => onStepChange?.(next)}
          >
            Next
          </button>
        ) : (
          <span className="df-foot-note mono">Approval is irreversible.</span>
        )}
      </footer>
    </div>
  );
}
