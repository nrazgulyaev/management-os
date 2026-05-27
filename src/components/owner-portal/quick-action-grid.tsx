import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.3 owner-01 — QuickActionGrid.
 *
 * 4-up card grid (2-up at ≤720px). Each card is a Link with an
 * icon + label + 1-line context. Used on the owner home to give
 * the owner immediate paths into the other cabinets.
 */

export interface QuickAction {
  id: string;
  href: string;
  label: string;
  context: React.ReactNode;
  icon?: React.ReactNode;
}

export interface QuickActionGridProps {
  actions: QuickAction[];
  className?: string;
}

export function QuickActionGrid({ actions, className }: QuickActionGridProps) {
  return (
    <div className={`quick-action-grid${className ? ` ${className}` : ""}`}>
      {actions.map((a) => (
        <Link className="qa-card" key={a.id} href={a.href}>
          {a.icon && <span className="qa-icon" aria-hidden>{a.icon}</span>}
          <span className="qa-label">{a.label}</span>
          <span className="qa-ctx">{a.context}</span>
        </Link>
      ))}
    </div>
  );
}
