import * as React from "react";

/**
 * Phase 2.1 PR 4 — AgentOutputCard (template 07 · right rail).
 *
 * Structured-output card: mono eyebrow + title + grid of key/value
 * rows + optional actions footer. Used for run summaries (Tokens
 * in/out, Cost, Latency, Tool calls).
 */

export interface OutputRow {
  key: string;
  value: React.ReactNode;
}

export interface AgentOutputCardProps {
  eyebrow: string;
  title?: React.ReactNode;
  rows?: OutputRow[];
  actions?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}

export function AgentOutputCard({
  eyebrow,
  title,
  rows,
  actions,
  children,
  className,
}: AgentOutputCardProps) {
  return (
    <div className={`output${className ? ` ${className}` : ""}`}>
      <div className="ft">{eyebrow}</div>
      {title && <h4>{title}</h4>}
      {rows && rows.length > 0 && (
        <div className="output-rows">
          {rows.map((r) => (
            <div className="row" key={r.key}>
              <span className="k">{r.key}</span>
              <span className="v">{r.value}</span>
            </div>
          ))}
        </div>
      )}
      {children}
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
