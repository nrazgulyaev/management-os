import * as React from "react";
import Link from "next/link";
import { HealthPill, type HealthLevel } from "./health-pill";
import { ProgressBar } from "./progress-bar";

/**
 * Phase 2.2 dev-01 — ProjectCard.
 *
 * Horizontal list row card (not a table cell). Pixel target =
 * `cabinets/dev-p1/projects.html` `.proj-card`: an engineering-grade
 * row of [thumb · name + sub · progress bar · stat num-kpis · health
 * pill · Open →]. Projects deserve more horizontal real estate than a
 * tabular row, so each occupies a full-width card stacked in a single
 * column via `.projects-grid`.
 */

export interface ProjectCardStat {
  label: React.ReactNode;
  value: React.ReactNode;
  /** Tints the value (variance over/under plan). */
  tone?: "ink" | "ok" | "warn" | "danger";
}

export interface ProjectCardProps {
  id: string;
  href: string;
  code: string;
  name: string;
  /** Lifecycle phase label (e.g. "UBUD · 8 VILLAS · BUILDING · WK 36/64"). */
  phaseLabel: string;
  /** 0..100 — schedule progress. */
  schedulePct: number;
  /** Right-aligned schedule label (e.g. "est. Dec 2026"). */
  scheduleLabel?: React.ReactNode;
  health: HealthLevel;
  /** Verbose health reason rendered inside the pill ("Amber · BOQ alert"). */
  healthReason?: string;
  /** Inline number+label stats shown between the bar and the health pill. */
  stats?: ProjectCardStat[];
}

const STAT_TONE: Record<NonNullable<ProjectCardStat["tone"]>, string> = {
  ink: "",
  ok: "tone-ok",
  warn: "tone-warn",
  danger: "tone-danger",
};

export function ProjectCard({
  href,
  code,
  name,
  phaseLabel,
  schedulePct,
  scheduleLabel,
  health,
  healthReason,
  stats,
}: ProjectCardProps) {
  return (
    <Link className="project-card" href={href}>
      <span className="proj-thumb">{code}</span>
      <div className="proj-meta">
        <h3 className="proj-name">{name}</h3>
        <div className="proj-sub">{phaseLabel}</div>
      </div>
      <ProgressBar
        className="proj-progress"
        pct={schedulePct}
        label={scheduleLabel}
        caption={`${Math.round(schedulePct)}%`}
      />
      {stats && stats.length > 0 && (
        <div className="proj-stats">
          {stats.map((s, i) => (
            <span className={`num-kpi ${STAT_TONE[s.tone ?? "ink"]}`} key={i}>
              <span className="label">{s.label}</span>
              <span className="value">{s.value}</span>
            </span>
          ))}
        </div>
      )}
      <HealthPill level={health} reason={healthReason} verbose verboseLabel={healthReason} />
      <span className="proj-open btn btn-dark btn-sm">Open →</span>
    </Link>
  );
}
