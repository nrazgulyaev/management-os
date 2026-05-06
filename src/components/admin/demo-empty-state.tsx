/**
 * P116A — Polished empty state for admin / operator dashboards.
 *
 * Use when a list is empty AND the operator is in demo mode.  Surfaces
 * the seed source + a clear next-step CTA so the surface never looks
 * "broken".  Pure UI — no DB / env reads.
 */

import * as React from "react";
import Link from "next/link";
import { Sparkles } from "lucide-react";

export function DemoEmptyState({
  title,
  description,
  seedHint,
  cta,
  href,
}: {
  title: string;
  description: string;
  seedHint?: string;
  cta?: string;
  href?: string;
}) {
  return (
    <div className="rounded-md border border-dashed border-line-soft bg-muted/20 p-8 flex flex-col items-start gap-3">
      <div className="w-9 h-9 rounded-md bg-ink/5 inline-flex items-center justify-center">
        <Sparkles
          className="w-4 h-4 text-ink-secondary"
          strokeWidth={1.75}
        />
      </div>
      <h3 className="text-base font-medium text-ink">{title}</h3>
      <p className="text-sm text-ink-secondary leading-relaxed max-w-prose">
        {description}
      </p>
      {seedHint && (
        <p className="text-xs text-ink-tertiary leading-relaxed">
          <span className="font-medium text-ink-secondary">Seed hint:</span>{" "}
          {seedHint}
        </p>
      )}
      {cta && href && (
        <Link
          href={href}
          className="inline-flex items-center h-9 px-4 rounded-md border border-line-soft text-sm text-ink hover:border-line-strong"
        >
          {cta}
        </Link>
      )}
    </div>
  );
}
