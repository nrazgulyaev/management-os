"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/**
 * SESSION-RESOLUTION-1 P3 — error boundary for the site-report detail page.
 *
 * Catches unexpected server-render exceptions and shows a friendly fallback
 * with the digest for debugging. Without this boundary, a crash inside the
 * server component bubbles up to the framework-level "Application error"
 * full-screen banner, which is what the operator saw on digest
 * 2045856929@E352.
 */
export default function SiteReportDetailError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 flex flex-col gap-4">
      <Link
        href="/development-os/site-reports"
        className="inline-flex items-center gap-1.5 text-xs text-ink-tertiary hover:text-ink"
      >
        <ArrowLeft className="w-3.5 h-3.5" strokeWidth={1.75} />
        All site reports
      </Link>
      <h1 className="text-display text-[32px] leading-tight text-ink">
        Couldn&apos;t load this report.
      </h1>
      <p className="text-sm text-ink-secondary">
        The page hit an unexpected error. Your report data is safe — only the
        view failed to render. Try again, or check the daily reports list.
      </p>
      {error.digest && (
        <p className="text-[11px] font-mono text-ink-tertiary">
          digest: {error.digest}
        </p>
      )}
      <div className="flex items-center gap-2 mt-2">
        <button
          onClick={reset}
          className="rounded-md bg-ink px-4 py-2 text-sm text-ink-inverse hover:bg-ink/90"
        >
          Try again
        </button>
        <Link
          href="/development-os/site-reports"
          className="rounded-md border border-line-soft px-4 py-2 text-sm text-ink hover:border-line-strong"
        >
          Back to reports
        </Link>
      </div>
    </div>
  );
}
