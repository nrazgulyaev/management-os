import * as React from "react";

/**
 * Phase 2.3 owner-07 — SettingsRow.
 *
 * Generic 3-column grid row: label / value / action. Used for both
 * the read-mostly rows (with a "Change" button as action) and the
 * notification toggle rows (with Toggle as action).
 */

export interface SettingsRowProps {
  label: string;
  helper?: string;
  value?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
}

export function SettingsRow({ label, helper, value, action, className }: SettingsRowProps) {
  return (
    <div className={`settings-row${className ? ` ${className}` : ""}`}>
      <div className="sr-label">
        <div className="sr-label-text">{label}</div>
        {helper && <div className="sr-label-helper">{helper}</div>}
      </div>
      <div className="sr-value">{value}</div>
      <div className="sr-action">{action}</div>
    </div>
  );
}
