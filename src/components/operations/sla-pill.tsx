import * as React from "react";
import type { SlaStatus } from "@/features/maintenance/sla";

export interface SlaPillProps {
  status: SlaStatus;
  /** Optional "2h left" hint shown after the label. */
  hint?: React.ReactNode;
  className?: string;
}

const LABEL: Record<SlaStatus, string> = {
  "on-track": "On track",
  "at-risk": "At risk",
  breached: "Breached",
};

const CLASS: Record<SlaStatus, string> = {
  "on-track": "ok",
  "at-risk": "warn",
  breached: "danger",
};

export function SlaPill({ status, hint, className }: SlaPillProps) {
  return (
    <span className={`sla-pill ${CLASS[status]}${className ? ` ${className}` : ""}`}>
      <span className="dot" aria-hidden />
      {LABEL[status]}
      {hint && <span className="hint">· {hint}</span>}
    </span>
  );
}
