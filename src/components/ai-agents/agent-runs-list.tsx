import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.1 PR 4 — AgentRunsList (template 07 · right rail).
 *
 * Compact recent-runs list: pill (AUTO/ROUTED/ERR) + summary + time
 * + optional href to the structured-output page.
 */

export type AgentRunResult = "auto" | "routed" | "error";

export interface AgentRunRow {
  id: string;
  result: AgentRunResult;
  summary: React.ReactNode;
  /** Short timestamp display (e.g. "14:38" or "3m ago"). */
  when: string;
  href?: string;
}

export interface AgentRunsListProps {
  runs: AgentRunRow[];
  /** Total run count when known — drives "7 of 142" style header. */
  total?: number;
  /** "See all runs →" link target. */
  seeAllHref?: string;
  className?: string;
}

const RESULT_LABEL: Record<AgentRunResult, { label: string; cls: string }> = {
  auto: { label: "AUTO", cls: "badge-ok" },
  routed: { label: "ROUTED", cls: "badge-warn" },
  error: { label: "ERR", cls: "badge-danger" },
};

export function AgentRunsList({ runs, total, seeAllHref, className }: AgentRunsListProps) {
  return (
    <div className={`output${className ? ` ${className}` : ""}`}>
      <div className="ft">
        Recent runs{total !== undefined ? ` · ${runs.length} of ${total}` : ""}
      </div>
      {runs.length === 0 ? (
        <div className="runs-empty">No recent runs.</div>
      ) : (
        <ul className="runs-list">
          {runs.map((r) => {
            const { label, cls } = RESULT_LABEL[r.result];
            const inner = (
              <>
                <span className={`badge ${cls}`}>{label}</span>
                <span className="what">{r.summary}</span>
                <span className="when mono">{r.when}</span>
              </>
            );
            return (
              <li key={r.id}>
                {r.href ? <Link href={r.href}>{inner}</Link> : <div>{inner}</div>}
              </li>
            );
          })}
        </ul>
      )}
      {seeAllHref && (
        <div className="actions">
          <Link href={seeAllHref} className="btn btn-secondary btn-sm" style={{ width: "100%" }}>
            See all runs →
          </Link>
        </div>
      )}
    </div>
  );
}
