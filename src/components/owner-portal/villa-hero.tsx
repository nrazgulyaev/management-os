import * as React from "react";

/**
 * Phase 2.3 owner-03 — VillaHero.
 *
 * 2-col hero: hero photo left + body (name + amenity badges +
 * 4-tile KPI strip) right. Stacks vertical at ≤900px.
 */

export interface VillaKpi {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
}

export interface VillaHeroProps {
  heroImageUrl?: string | null;
  code: string;
  name: string;
  location?: React.ReactNode;
  amenities: string[];
  kpis: VillaKpi[];
  className?: string;
}

export function VillaHero({ heroImageUrl, code, name, location, amenities, kpis, className }: VillaHeroProps) {
  return (
    <div className={`villa-hero${className ? ` ${className}` : ""}`}>
      <div className="vh-photo" style={heroImageUrl ? { backgroundImage: `url(${heroImageUrl})` } : undefined}>
        {!heroImageUrl && <span className="vh-fallback mono">{code}</span>}
      </div>
      <div className="vh-body">
        <div className="vh-code mono">{code}</div>
        <h1 className="vh-name">{name}</h1>
        {location && <div className="vh-loc">{location}</div>}
        {amenities.length > 0 && (
          <div className="vh-amenities">
            {amenities.map((a) => (
              <span className="vh-amenity" key={a}>{a}</span>
            ))}
          </div>
        )}
        <div className="vh-kpis">
          {kpis.map((k, i) => (
            <div className="vh-kpi" key={i}>
              <span className="value mono">{k.value}</span>
              <span className="label">{k.label}</span>
              {k.sub && <span className="sub">{k.sub}</span>}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
