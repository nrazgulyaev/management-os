"use client";

/**
 * Phase 2.1 PR 2 — BulkBar (template 04).
 *
 * Replaces the filter bar when ≥1 row is selected in the table.
 * Solid ink background, white text, list of contextual actions on
 * the right, dismiss button on the far right ("Clear selection").
 *
 * Actions are owned by the caller — this primitive is presentation
 * only. Danger-toned actions render with a destructive accent.
 */

import * as React from "react";

export interface BulkAction {
  id: string;
  label: string;
  icon?: React.ReactNode;
  danger?: boolean;
  onRun: () => void;
}

export interface BulkBarProps {
  selectedCount: number;
  actions: BulkAction[];
  onClear: () => void;
  className?: string;
}

export function BulkBar({ selectedCount, actions, onClear, className }: BulkBarProps) {
  if (selectedCount <= 0) return null;
  return (
    <div className={`bulk-bar${className ? ` ${className}` : ""}`} role="toolbar">
      <div className="selected">
        <b>{selectedCount}</b> selected
      </div>
      {actions.map((a) => (
        <button
          key={a.id}
          type="button"
          className={a.danger ? "danger" : undefined}
          onClick={a.onRun}
        >
          {a.icon}
          <span>{a.label}</span>
        </button>
      ))}
      <div className="spacer" />
      <button
        type="button"
        className="dismiss"
        onClick={onClear}
        aria-label="Clear selection"
      >
        Clear selection
      </button>
    </div>
  );
}
