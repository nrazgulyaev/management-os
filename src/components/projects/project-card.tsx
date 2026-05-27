import * as React from "react";
import Link from "next/link";
import { HealthPill, type HealthLevel } from "./health-pill";
import { ProgressBar } from "./progress-bar";

/**
 * Phase 2.2 dev-01 — ProjectCard.
 *
 * Grid-layout list row (not a table cell). Each project occupies a
 * card with: code badge + name + lifecycle phase + schedule
 * progress bar + budget burn bar + health pill + meta row (PM,
 * units, open RFIs).
 *
 * Compose into a 2- or 3-up grid via `.projects-grid` CSS.
 */

export interface ProjectCardProps {
  id: string;
  href: string;
  code: string;
  name: string;
  /** Lifecycle phase label (e.g. "Under construction · Phase 2 / 4"). */
  phaseLabel: string;
  /** 0..100 — schedule progress. */
  schedulePct: number;
  /** Right-aligned schedule label (e.g. "Day 142 of 540"). */
  scheduleLabel?: React.ReactNode;
  /** 0..100 — budget burn. */
  budgetPct: number;
  /** Right-aligned budget label (e.g. "$1.42M of $2.45M"). */
  budgetLabel?: React.ReactNode;
  health: HealthLevel;
  healthReason?: string;
  /** Pill or chip strip beneath the meta row. */
  metaPills?: React.ReactNode;
  /** Lower-right inline stats — keep to 2-3 short items. */
  stats?: { label: string; value: React.ReactNode }[];
}

export function ProjectCard({
  href,
  code,
  name,
  phaseLabel,
  schedulePct,
  scheduleLabel,
  budgetPct,
  budgetLabel,
  health,
  healthReason,
  metaPills,
  stats,
}: ProjectCardProps) {
  return (
    <Link className="project-card" href={href}>
      <div className="head">
        <span className="code">{code}</span>
        <HealthPill level={health} reason={healthReason} />
      </div>
      <h3 className="name">{name}</h3>
      <div className="phase">{phaseLabel}</div>
      <ProgressBar
        caption="Schedule"
        pct={schedulePct}
        label={scheduleLabel}
      />
      <ProgressBar
        caption="Budget"
        pct={budgetPct}
        label={budgetLabel}
        tone={budgetPct > 95 ? "warn" : budgetPct > 105 ? "danger" : "accent"}
      />
      {metaPills && <div className="meta-pills">{metaPills}</div>}
      {stats && stats.length > 0 && (
        <div className="stats">
          {stats.map((s, i) => (
            <div className="stat" key={i}>
              <span className="value">{s.value}</span>
              <span className="label">{s.label}</span>
            </div>
          ))}
        </div>
      )}
    </Link>
  );
}
