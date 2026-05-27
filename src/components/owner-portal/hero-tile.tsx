import * as React from "react";

/**
 * Phase 2.3 owner-01 — HeroTile.
 *
 * Dark or flat tile primitive for the owner home. Larger and
 * calmer than the operations OpsTile — narrative density.
 *
 *   variant="dark"  → ink background, used as the headline tile
 *   variant="flat"  → paper background, used for supporting tiles
 */

export interface HeroTileProps {
  variant?: "dark" | "flat";
  label: React.ReactNode;
  value: React.ReactNode;
  /** Sub-line beneath the big number. */
  sub?: React.ReactNode;
  /** Footer line (e.g. "Next statement · May 5"). */
  foot?: React.ReactNode;
  className?: string;
}

export function HeroTile({ variant = "flat", label, value, sub, foot, className }: HeroTileProps) {
  return (
    <div className={`hero-tile ${variant}${className ? ` ${className}` : ""}`}>
      <div className="ht-label">{label}</div>
      <div className="ht-value">{value}</div>
      {sub && <div className="ht-sub">{sub}</div>}
      {foot && <div className="ht-foot">{foot}</div>}
    </div>
  );
}
