import * as React from "react";
import Link from "next/link";
import { MapPin } from "lucide-react";

/**
 * INVESTOR PORTAL — per-project narrative card (Overview variant B).
 *
 * Pixel-matches the `projectCard()` builder in the Investor Portal mock
 * (`Investor Portal.html`, Overview B): a thumbnail chip + project name +
 * location row, a status badge, a deployment progress bar (drawn /
 * committed), and a 3-cell footer grid of headline figures.
 *
 * Presentational only — the page passes already-formatted strings from
 * the live commitment query (`getMyCommitments`). The whole card is a
 * link to the commitment detail, preserving the existing navigation.
 *
 * The thumbnail gradient is one of a small deterministic palette keyed
 * off the card index so the engineering-palette accents (amber / steel /
 * lime) cycle the way the mock does — geometry-only inline style, the
 * single dynamic value the design contract allows for chart/bar
 * rendering, sourced from token-driven gradient classes on a wrapper.
 */

export type ProjectThumbTone = "amber" | "steel" | "lime";

const THUMB_CLASS: Record<ProjectThumbTone, string> = {
  amber: "bg-gradient-to-br from-amber-soft to-amber-deep",
  steel: "bg-gradient-to-br from-steel-soft to-steel",
  lime: "bg-gradient-to-br from-lime to-ok",
};

const BAR_CLASS: Record<ProjectThumbTone, string> = {
  amber: "bg-amber",
  steel: "bg-steel",
  lime: "bg-lime",
};

export interface ProjectNarrativeStat {
  label: string;
  value: string;
}

export interface ProjectNarrativeCardProps {
  href: string;
  name: string;
  /** Secondary location / commitment-code line under the name. */
  meta: string;
  tone: ProjectThumbTone;
  /** Status badge text. */
  statusLabel: string;
  statusClassName: string;
  /** Deployment progress 0–100. */
  deployedPercent: number;
  /** Right-hand "$called / $committed" caption above the bar. */
  deployedCaption: string;
  /** Three footer headline stats (Committed · Drawn · Remaining). */
  stats: [ProjectNarrativeStat, ProjectNarrativeStat, ProjectNarrativeStat];
}

export function ProjectNarrativeCard({
  href,
  name,
  meta,
  tone,
  statusLabel,
  statusClassName,
  deployedPercent,
  deployedCaption,
  stats,
}: ProjectNarrativeCardProps) {
  const width = Math.max(0, Math.min(100, deployedPercent));
  return (
    <Link
      href={href}
      className="block overflow-hidden rounded-[18px] border border-line bg-panel shadow-soft-card transition-all hover:border-line-strong hover:shadow-elevated-card"
    >
      <div className="flex items-center gap-3.5 px-5 pt-[18px]">
        <span
          className={`h-[52px] w-[52px] flex-none rounded-[12px] ${THUMB_CLASS[tone]}`}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-base font-medium tracking-[-0.01em] text-ink">
            {name}
          </div>
          <div className="mt-0.5 flex items-center gap-1 text-[12px] text-ink-tertiary">
            <MapPin className="h-3 w-3 flex-none" strokeWidth={2} />
            <span className="truncate">{meta}</span>
          </div>
        </div>
        <span
          className={`inline-flex flex-none items-center rounded-full px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.08em] ${statusClassName}`}
        >
          {statusLabel}
        </span>
      </div>

      <div className="px-5 pb-4 pt-4">
        <div className="mb-[7px] flex items-center justify-between gap-3">
          <span className="text-[12px] text-ink-tertiary">
            Deployed {width.toFixed(0)}%
          </span>
          <span className="font-mono text-[12px] tabular-nums text-ink-tertiary">
            {deployedCaption}
          </span>
        </div>
        <div className="h-[7px] overflow-hidden rounded-[4px] bg-line-soft">
          <div
            className={`h-full rounded-[4px] ${BAR_CLASS[tone]}`}
            style={{ width: `${width}%` }}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 border-t border-line-soft">
        {stats.map((s, i) => (
          <div
            key={s.label}
            className={`px-5 py-3.5 ${i < 2 ? "border-r border-line-soft" : ""}`}
          >
            <div className="font-mono text-[9.5px] uppercase tracking-[0.1em] text-ink-tertiary">
              {s.label}
            </div>
            <div className="mt-1.5 font-display text-[19px] font-medium tabular-nums text-ink">
              {s.value}
            </div>
          </div>
        ))}
      </div>
    </Link>
  );
}
