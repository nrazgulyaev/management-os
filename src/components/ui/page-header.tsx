import * as React from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  eyebrow,
  title,
  description,
  breadcrumbs,
  actions,
  className,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  breadcrumbs?: { label: string; href?: string }[];
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <header className={cn("flex flex-col gap-5", className)}>
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="flex items-center gap-1 text-xs text-ink-tertiary">
          {breadcrumbs.map((b, i) => (
            <React.Fragment key={i}>
              {b.href ? (
                <Link
                  href={b.href}
                  className="hover:text-ink transition-colors"
                >
                  {b.label}
                </Link>
              ) : (
                <span className="text-ink-secondary">{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && (
                <ChevronRight className="w-3 h-3 opacity-60" />
              )}
            </React.Fragment>
          ))}
        </nav>
      )}
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="flex flex-col gap-2 max-w-3xl">
          {eyebrow && <span className="text-label">{eyebrow}</span>}
          <h1 className="text-display text-[36px] leading-[1.1] md:text-[44px] md:leading-[1.08] font-medium text-ink tracking-tight">
            {title}
          </h1>
          {description && (
            <p className="text-ink-secondary text-base md:text-lg leading-relaxed max-w-2xl">
              {description}
            </p>
          )}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0">{actions}</div>
        )}
      </div>
    </header>
  );
}
