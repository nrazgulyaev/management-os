import * as React from "react";

/**
 * Phase 2.1 PR 2 — DetailPage shell (template 05).
 *
 * Server-friendly composition wrapper. Children render in order;
 * the action bar (B8) is matched by class and sticks to the bottom
 * via CSS — no positional gymnastics needed here. Pages opt out of
 * the main-and-side grid by simply not rendering a `<DetailSide>`.
 */

export interface DetailPageProps {
  children: React.ReactNode;
  className?: string;
}

export function DetailPage({ children, className }: DetailPageProps) {
  return (
    <div className={`detail-page${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

/**
 * `<DetailMainAndSide>` — explicit two-column grouping. Used when a
 * detail page needs both a main column AND a 300px right rail.
 * Compose like:
 *
 *   <DetailPage>
 *     <DetailHeader … />
 *     <DetailTabs … />
 *     <DetailMainAndSide>
 *       <main>…</main>
 *       <DetailSide cards={…} />
 *     </DetailMainAndSide>
 *     <DetailActionBar … />
 *   </DetailPage>
 */
export function DetailMainAndSide({ children }: { children: React.ReactNode }) {
  return <div className="main-and-side">{children}</div>;
}
