"use client";

import { Printer } from "lucide-react";

/**
 * Print / save-as-PDF trigger for the offline guest sheet. Replaces the
 * CSP-hostile `<a href="javascript:window.print()">` with a real button
 * that calls `window.print()` on click.
 */
export function PrintButton({ className }: { className?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className={
        className ??
        "inline-flex items-center gap-1.5 text-xs text-ink hover:underline underline-offset-4"
      }
    >
      <Printer className="w-3.5 h-3.5" /> Print or save as PDF
    </button>
  );
}
