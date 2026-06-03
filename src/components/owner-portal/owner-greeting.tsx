import * as React from "react";

/**
 * Phase 2.3 owner-01 — OwnerGreeting.
 *
 * Big 48px display greeting + narrative paragraph. Used as the
 * first block on the owner home so the page opens calm.
 */

export interface OwnerGreetingProps {
  ownerName: string;
  /** Optional eyebrow ("Good morning · Bali · GMT+8"). */
  eyebrow?: React.ReactNode;
  /** Narrative paragraph below the greeting. */
  narrative: React.ReactNode;
  className?: string;
}

export function OwnerGreeting({ ownerName, eyebrow, narrative, className }: OwnerGreetingProps) {
  return (
    <header className={`owner-greeting${className ? ` ${className}` : ""}`}>
      {eyebrow && <div className="owner-eyebrow mono">{eyebrow}</div>}
      <h1 className="greet">
        Welcome back, <em>{ownerName.split(/\s+/)[0]}.</em>
      </h1>
      <p className="owner-narr">{narrative}</p>
    </header>
  );
}
