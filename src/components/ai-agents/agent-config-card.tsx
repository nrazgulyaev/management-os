import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.1 PR 4 — AgentConfigCard (template 07 · right rail).
 *
 * Show-only configuration block: confidence threshold, channels,
 * knowledge base sync, etc. Edit link drops the user into the
 * agent settings page (built in 2.2).
 */

export interface ConfigRow {
  key: string;
  value: React.ReactNode;
}

export interface AgentConfigCardProps {
  rows: ConfigRow[];
  editHref?: string;
}

export function AgentConfigCard({ rows, editHref }: AgentConfigCardProps) {
  return (
    <div className="output">
      <div className="ft">Configuration</div>
      <div className="output-rows">
        {rows.map((r) => (
          <div className="row" key={r.key}>
            <span className="k">{r.key}</span>
            <span className="v">{r.value}</span>
          </div>
        ))}
      </div>
      {editHref && (
        <div className="actions">
          <Link href={editHref} className="btn btn-secondary btn-sm" style={{ width: "100%" }}>
            Edit settings
          </Link>
        </div>
      )}
    </div>
  );
}
