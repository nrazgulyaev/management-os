import * as React from "react";
import Link from "next/link";

/**
 * Phase 2.1 PR 2 — DetailHeader (brick B1 · template 05).
 *
 * Breadcrumb + h1 (display font, 34px) + meta line (mono) + actions
 * cluster. Uses the existing `[data-product] .page-header` styles so
 * the visual matches the rest of the cabinet chrome.
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export interface DetailHeaderProps {
  breadcrumb: BreadcrumbItem[];
  title: React.ReactNode;
  /** Mono meta row beneath the title (badges, dates, codes). */
  meta?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}

export function DetailHeader({
  breadcrumb,
  title,
  meta,
  actions,
  className,
}: DetailHeaderProps) {
  return (
    <div className={`page-header${className ? ` ${className}` : ""}`}>
      <div className="left">
        {breadcrumb.length > 0 && (
          <div className="crumb">
            {breadcrumb.map((b, i) => {
              const last = i === breadcrumb.length - 1;
              return (
                <React.Fragment key={`${b.label}-${i}`}>
                  {b.href && !last ? (
                    <Link href={b.href}>{b.label}</Link>
                  ) : (
                    <span>{b.label}</span>
                  )}
                  {!last && <span aria-hidden>/</span>}
                </React.Fragment>
              );
            })}
          </div>
        )}
        <h1>{title}</h1>
        {meta && <div className="page-header-meta">{meta}</div>}
      </div>
      {actions && <div className="actions">{actions}</div>}
    </div>
  );
}
