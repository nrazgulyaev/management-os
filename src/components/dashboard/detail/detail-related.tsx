import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.1 PR 2 — DetailRelated (brick B5 · template 05).
 *
 * Bottom-of-page "Also see" strip. Default 3-up card grid; collapses
 * to a single-column list when `single` is set (e.g. owner with a
 * single villa).
 */

export interface RelatedItem {
  id: string;
  href?: string;
  /** Avatar / initials / icon. */
  glyph?: React.ReactNode;
  title: React.ReactNode;
  meta?: React.ReactNode;
  /** Right-side accessory (e.g. small "Open →" button). */
  accessory?: React.ReactNode;
}

export interface DetailRelatedProps {
  /** Section eyebrow ("Also see", "Owner's villas", etc). */
  eyebrow?: string;
  items: RelatedItem[];
  /** Single-column layout. Default false → 3-up grid. */
  single?: boolean;
  className?: string;
}

export function DetailRelated({
  eyebrow = "Also see",
  items,
  single,
  className,
}: DetailRelatedProps) {
  if (items.length === 0) return null;
  return (
    <section className={`related${className ? ` ${className}` : ""}`}>
      <div className="ft">{eyebrow}</div>
      <div className={`row${single ? " single" : ""}`}>
        {items.map((it) => {
          const inner = (
            <>
              {it.glyph}
              <div className="related-text">
                <div className="what">{it.title}</div>
                {it.meta && <div className="meta">{it.meta}</div>}
              </div>
              {it.accessory}
            </>
          );
          return it.href ? (
            <Link key={it.id} className="item" href={it.href}>
              {inner}
            </Link>
          ) : (
            <div key={it.id} className="item">
              {inner}
            </div>
          );
        })}
      </div>
    </section>
  );
}
