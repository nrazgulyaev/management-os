import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.3 owner-01 — VillaCard.
 *
 * Cross-cabinet primitive — owner home + /owner/villas list use
 * this. Two orientations:
 *
 *   col  → tall card (hero image area + body + stats stacked)
 *   row  → horizontal card (image left, content right)
 */

export interface VillaCardProps {
  href: string;
  code: string;
  name: string;
  /** Hero image URL (or null → gradient placeholder). */
  imageUrl?: string | null;
  bedrooms: number;
  /** Occupancy 0..100 (MTD). */
  occupancyPct: number;
  /** Net to owner this month, USD major. */
  netUsd: number;
  /** Pretty location (e.g. "Ubud, Bali"). */
  location?: string;
  orientation?: "col" | "row";
  className?: string;
}

function fmtUsd(usd: number): string {
  if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (Math.abs(usd) >= 1_000) return `$${(usd / 1_000).toFixed(0)}K`;
  return `$${Math.round(usd)}`;
}

export function VillaCard({
  href,
  code,
  name,
  imageUrl,
  bedrooms,
  occupancyPct,
  netUsd,
  location,
  orientation = "col",
  className,
}: VillaCardProps) {
  // Image plate fallback uses the villa code over the location, mirroring
  // the mock's "EV-07 / UBUD" two-line plate.
  const heroStyle = imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined;
  return (
    <Link className={`villa-card ${orientation}${className ? ` ${className}` : ""}`} href={href}>
      <div className="vc-hero" style={heroStyle}>
        {!imageUrl && (
          <span className="vc-hero-fallback mono">
            {code}
            {location && (
              <>
                <br />
                {location}
              </>
            )}
          </span>
        )}
      </div>
      <div className="vc-body">
        <div className="vc-head">
          <h3 className="vc-name">{name}</h3>
          <span className="vc-code mono">
            {code}
            {location ? ` · ${location}` : ""} · {bedrooms} BR
          </span>
        </div>
        <div className="vc-stats">
          <div className="vc-stat">
            <span className="label">Occupancy</span>
            <span className={`value mono${occupancyPct >= 70 ? " up" : ""}`}>
              {occupancyPct}%
            </span>
          </div>
          <div className="vc-stat">
            <span className="label">Bedrooms</span>
            <span className="value mono">{bedrooms}</span>
          </div>
          <div className="vc-stat">
            <span className="label">Net · MTD</span>
            <span className="value mono">{fmtUsd(netUsd)}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
