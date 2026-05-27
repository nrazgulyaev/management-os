import * as React from "react";

/**
 * Phase 2.1 PR 2 — DetailActivity (brick B6 · template 05).
 *
 * Vertical timeline with dots + line connectors. Each entry: meta
 * (mono uppercase) + what (Inter, with italic-emphasis-as-quote).
 * Dot color matches event kind — accent (state changes), ok
 * (success), warn (anomaly), neutral (default).
 */

export type ActivityKind = "accent" | "ok" | "warn" | "neutral";

export interface ActivityEntry {
  id: string;
  /** Mono uppercase preamble (e.g. "14M AGO · STATEMENT"). */
  when: string;
  /** Body (free-form). Use `<em>` for inline quotes. */
  what: React.ReactNode;
  kind?: ActivityKind;
}

export interface DetailActivityProps {
  entries: ActivityEntry[];
  className?: string;
}

const KIND_CLASS: Record<ActivityKind, string> = {
  accent: "accent",
  ok: "ok",
  warn: "warn",
  neutral: "",
};

export function DetailActivity({ entries, className }: DetailActivityProps) {
  return (
    <ol className={`activity${className ? ` ${className}` : ""}`}>
      {entries.map((e, i) => {
        const isLast = i === entries.length - 1;
        const dotCls = KIND_CLASS[e.kind ?? "neutral"];
        return (
          <li key={e.id} className="activity-item">
            <div className="marker">
              <span className={`dot${dotCls ? ` ${dotCls}` : ""}`} aria-hidden />
              {!isLast && <span className="line" aria-hidden />}
            </div>
            <div className="body">
              <div className="meta">{e.when}</div>
              <div className="what">{e.what}</div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
