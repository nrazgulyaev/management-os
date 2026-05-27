import * as React from "react";

/**
 * Phase 2.2 mgmt-03 — PortalStatusDot.
 *
 * 3 states: active (signed in recently), invited (link sent, not
 * yet redeemed), not-invited (no portal account). Tiny dot for
 * table rows; verbose form adds the label.
 */

export type PortalStatus = "active" | "invited" | "not-invited";

export interface PortalDotProps {
  status: PortalStatus;
  verbose?: boolean;
  /** "Last seen 3d ago" etc. */
  lastSeenLabel?: string;
  className?: string;
}

const LABEL: Record<PortalStatus, string> = {
  active: "Active",
  invited: "Invited",
  "not-invited": "Not invited",
};

export function PortalStatusDot({ status, verbose, lastSeenLabel, className }: PortalDotProps) {
  return (
    <span className={`portal-dot ${status}${className ? ` ${className}` : ""}`} title={lastSeenLabel ?? LABEL[status]}>
      <span className="dot" aria-hidden />
      {verbose && <span className="lbl">{LABEL[status]}</span>}
    </span>
  );
}
