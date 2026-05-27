import * as React from "react";

/**
 * Phase 2.2 dev-04 — RfqStatusPill.
 *
 * 5 states matching the spec: draft / sent / quoting / awarded / closed.
 */

export type RfqStatus = "draft" | "sent" | "quoting" | "awarded" | "closed";

const LABEL: Record<RfqStatus, string> = {
  draft: "Draft",
  sent: "Sent",
  quoting: "Quoting",
  awarded: "Awarded",
  closed: "Closed",
};

export interface RfqStatusPillProps {
  status: RfqStatus;
  className?: string;
}

export function RfqStatusPill({ status, className }: RfqStatusPillProps) {
  return (
    <span className={`rfq-status ${status}${className ? ` ${className}` : ""}`}>
      <span className="dot" aria-hidden />
      {LABEL[status]}
    </span>
  );
}
