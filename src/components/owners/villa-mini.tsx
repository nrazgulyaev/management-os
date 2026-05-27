import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.2 mgmt-03 — VillaMini.
 *
 * Compact villa chip used in the owner-detail side panel and on
 * the statement-detail page (cross-cabinet). Shows code + bedrooms
 * + management model + (optional) YTD net to owner.
 */

export interface VillaMiniProps {
  href: string;
  code: string;
  name?: string;
  bedrooms: number;
  managementModel: string;
  /** Optional inline stat (e.g. "$142k YTD"). */
  statLabel?: string;
  statValue?: React.ReactNode;
}

export function VillaMini({
  href,
  code,
  name,
  bedrooms,
  managementModel,
  statLabel,
  statValue,
}: VillaMiniProps) {
  return (
    <Link className="villa-mini" href={href}>
      <span className="vm-code mono">{code}</span>
      <div className="vm-body">
        <div className="vm-name">{name ?? code}</div>
        <div className="vm-meta mono">
          {bedrooms} BR · {managementModel}
        </div>
      </div>
      {statValue !== undefined && (
        <div className="vm-stat">
          <span className="value mono">{statValue}</span>
          {statLabel && <span className="label">{statLabel}</span>}
        </div>
      )}
    </Link>
  );
}
