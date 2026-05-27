import * as React from "react";
import { OpsTile } from "./ops-tile";

/**
 * Phase 2.2 mgmt-04 — OpsHero.
 *
 * 3-tile hero strip:
 *   1. Arrivals today (dark, takes 1.5x width)
 *   2. SLA breach summary
 *   3. Turnovers in flight
 */

export interface OpsHeroProps {
  arrivals: { today: number; tomorrow: number; nextCheckIn?: string };
  sla: { onTrack: number; atRisk: number; breached: number };
  turnovers: { todayTotal: number; done: number; inFlight: number };
  className?: string;
}

export function OpsHero({ arrivals, sla, turnovers, className }: OpsHeroProps) {
  const slaTone = sla.breached > 0 ? "danger" : sla.atRisk > 0 ? "warn" : "ok";
  return (
    <div className={`ops-hero${className ? ` ${className}` : ""}`}>
      <OpsTile
        dark
        label="Arrivals today"
        value={arrivals.today}
        context={`+${arrivals.tomorrow} tomorrow`}
        footer={arrivals.nextCheckIn && <>Next check-in <b>{arrivals.nextCheckIn}</b></>}
      />
      <OpsTile
        tone={slaTone}
        label="SLA · maintenance"
        value={sla.breached > 0 ? `${sla.breached} breached` : sla.atRisk > 0 ? `${sla.atRisk} at risk` : "All on track"}
        context={`${sla.onTrack} on track · ${sla.atRisk} at risk · ${sla.breached} breached`}
      />
      <OpsTile
        tone="accent"
        label="Turnovers today"
        value={`${turnovers.done} / ${turnovers.todayTotal}`}
        context={`${turnovers.inFlight} in flight`}
      />
    </div>
  );
}
