import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.1 PR 4 — AgentCard (template 07 · catalog item).
 *
 * One agent slot in the catalog grid. Glyph + name + sub + runs row
 * at the bottom (24h runs, auto-resolved %, live indicator OR
 * schedule string).
 */

export type AgentTone = "accent" | "gold" | "steel" | "neutral";

export interface AgentCardProps {
  code: string;
  name: string;
  description: string;
  category?: string;
  tone?: AgentTone;
  /** Runs in the last 24h. Falsy → label hides. */
  runs24h?: number;
  /** Optional secondary stat (0..100). */
  autoResolvedPct?: number;
  /** Live = green pulse + "LIVE". */
  isLive?: boolean;
  /** Free-form schedule text shown when not live (e.g. "SCHED 06:00"). */
  schedule?: string;
  href: string;
  /** Override the default ✦ glyph. */
  icon?: React.ReactNode;
}

const TONE_CLASS: Record<AgentTone, string> = {
  accent: "",
  gold: "gold",
  steel: "steel",
  neutral: "neutral",
};

export function AgentCard({
  code,
  name,
  description,
  tone = "accent",
  runs24h,
  autoResolvedPct,
  isLive,
  schedule,
  href,
  icon,
}: AgentCardProps) {
  return (
    <Link className="agent-card" href={href} data-agent-code={code}>
      <div className="head">
        <span className={`glyph ${TONE_CLASS[tone]}`} aria-hidden>
          {icon ?? <DefaultGlyph />}
        </span>
        <h4>{name}</h4>
        {isLive && <span className="pulse-dot ok" aria-label="Live" />}
      </div>
      <div className="sub">{description}</div>
      <div className="runs-row">
        {runs24h !== undefined && (
          <span>
            <b>{runs24h}</b> RUNS · 24H
          </span>
        )}
        {autoResolvedPct !== undefined && (
          <span>
            <b>{autoResolvedPct}%</b> AUTO-RESOLVED
          </span>
        )}
        {isLive ? (
          <span className="live">
            <span className="pulse-dot ok" /> LIVE
          </span>
        ) : (
          schedule && <span className="live muted">{schedule}</span>
        )}
      </div>
    </Link>
  );
}

function DefaultGlyph() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
    </svg>
  );
}
