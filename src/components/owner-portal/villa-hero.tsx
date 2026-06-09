import * as React from "react";

/**
 * Phase 2.3 owner-03 — VillaHero.
 *
 * 2-col hero: full-bleed gradient hero photo (left, 1.5fr) with the
 * amenity badges floating over the bottom-left, and a body (right)
 * carrying the villa code, serif name, location, narrative blurb and
 * a dashed-top 3-up KPI strip. Stacks vertical at ≤900px.
 *
 * Pixel-ported from cabinets/owner-p1/03-villas.html (detail view).
 */

export interface VillaKpi {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Tints the serif value — "ok" (occupancy) / "terra" (payout). */
  tone?: "ok" | "terra";
}

export interface VillaHeroProps {
  heroImageUrl?: string | null;
  code: string;
  name: string;
  /** Optional narrative description (one or two sentences). */
  feat?: React.ReactNode;
  location?: React.ReactNode;
  amenities: string[];
  kpis: VillaKpi[];
  className?: string;
}

export function VillaHero({
  heroImageUrl,
  code,
  name,
  feat,
  location,
  amenities,
  kpis,
  className,
}: VillaHeroProps) {
  return (
    <div className={`villa-hero${className ? ` ${className}` : ""}`}>
      <div
        className="vh-photo"
        style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}
      >
        {!heroImageUrl && <span className="vh-fallback">[ {code} ]</span>}
        {amenities.length > 0 && (
          <div className="vh-amenities">
            {amenities.map((a) => (
              <span className="vh-amenity" key={a}>
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className="vh-body">
        <div className="vh-code">{code}</div>
        <h1 className="vh-name">{name}</h1>
        {location && <div className="vh-loc">{location}</div>}
        {feat && <p className="vh-feat">{feat}</p>}
        <div className="vh-kpis">
          {kpis.map((k, i) => (
            <div className="vh-kpi" key={i}>
              <span
                className={`vh-kpi-value${k.tone ? ` is-${k.tone}` : ""}`}
              >
                {k.value}
              </span>
              <span className="vh-kpi-label">{k.label}</span>
              {k.sub && <span className="vh-kpi-label">{k.sub}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
