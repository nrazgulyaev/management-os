import * as React from "react";

/**
 * Phase 2.1 PR 2 — DetailSide (brick B4 · template 05).
 *
 * 300px right rail. Renders a stack of paper-bg cards on the
 * cream-warm rail background. Each card: mono eyebrow (`ft`),
 * display title (`h4`), free-form body. Stays sticky-top when the
 * main column scrolls (CSS owns this; no scroll listener here).
 */

export interface SideCard {
  id: string;
  /** Mono uppercase eyebrow line. */
  eyebrow: string;
  /** Card title (display font). */
  title?: React.ReactNode;
  body: React.ReactNode;
  /** Footer slot (links, buttons). */
  footer?: React.ReactNode;
}

export interface DetailSideProps {
  cards: SideCard[];
  className?: string;
}

export function DetailSide({ cards, className }: DetailSideProps) {
  return (
    <aside className={`dp-side${className ? ` ${className}` : ""}`}>
      {cards.map((c) => (
        <div className="side-card" key={c.id}>
          <div className="ft">{c.eyebrow}</div>
          {c.title && <h4>{c.title}</h4>}
          <div className="sub">{c.body}</div>
          {c.footer && <div className="side-card-foot">{c.footer}</div>}
        </div>
      ))}
    </aside>
  );
}
