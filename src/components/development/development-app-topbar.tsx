"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Search, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import type { ProductSlug } from "@/lib/products";

export function DevelopmentAppTopbar({
  title,
  enabledProducts: _enabledProducts = null,
}: {
  title?: string;
  /**
   * MEGA-SPRINT P1 — kept in the API for caller compatibility, but no
   * longer rendered. See DashboardTopbar for the architectural rationale
   * (HF-18 subdomain isolation; switcher caused CORS prefetch errors
   * on cross-product Link prefetch).
   */
  enabledProducts?: ProductSlug[] | null;
}) {
  return (
    // Arconique OS redesign — same treatment as Mgmt topbar.
    <header className="sticky top-0 z-30 h-16 border-b border-line bg-[rgba(245,241,233,0.78)] backdrop-blur-md flex items-center px-4 md:px-8 gap-3">
      <div className="md:hidden">
        <Logo variant="mark" />
      </div>

      {title && (
        <h1 className="hidden md:block text-sm font-medium text-ink-2">
          {title}
        </h1>
      )}

      <div className="flex-1 max-w-xl">
        <div className="hidden md:flex items-center gap-2.5 px-4 h-10 rounded-full border border-line bg-surface text-sm text-ink-3 cursor-text hover:border-ink-3 transition-colors">
          <Search className="w-4 h-4" strokeWidth={1.75} />
          <span>Search projects, vendors, drawings…</span>
          <kbd className="ml-auto text-[10px] tracking-wider text-ink-3 px-1.5 py-0.5 rounded bg-surface-warm border border-line">
            ⌘K
          </kbd>
        </div>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/development-os"
          className="hidden sm:inline-flex items-center gap-1.5 h-10 px-4 rounded-full border border-line bg-surface hover:bg-surface-warm text-sm text-ink transition-colors"
        >
          <Sparkles className="w-4 h-4 text-terra" strokeWidth={1.75} />
          <span>Assistants</span>
        </Link>
        <button
          type="button"
          className="h-10 rounded-full border border-line bg-surface hover:bg-surface-warm inline-flex items-center justify-center transition-colors px-3"
          aria-label="Notifications"
        >
          <Bell className="w-4 h-4 text-ink-2" strokeWidth={1.75} />
        </button>
        <button
          type="button"
          className="h-10 w-10 rounded-full bg-ink-deep text-white text-sm font-medium inline-flex items-center justify-center"
        >
          NR
        </button>
      </div>
    </header>
  );
}
