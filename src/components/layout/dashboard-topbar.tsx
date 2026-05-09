"use client";

import * as React from "react";
import Link from "next/link";
import { Bell, Search, Sparkles } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { WorkspaceSwitcher } from "@/components/shared/workspace-switcher";
import type { ProductSlug } from "@/lib/products";

export function DashboardTopbar({
  title,
  unreadCount = 0,
  enabledProducts = null,
}: {
  title?: string;
  unreadCount?: number;
  /** Stage 10.H — passed in from the server-side shell so the
   *  cross-product switcher only lists products this org can reach. */
  enabledProducts?: ProductSlug[] | null;
}) {
  return (
    <header className="sticky top-0 z-30 h-16 border-b border-line-soft bg-canvas/80 backdrop-blur flex items-center px-4 md:px-8 gap-3">
      <div className="lg:hidden">
        <Logo variant="mark" />
      </div>
      <WorkspaceSwitcher enabledProducts={enabledProducts} />
      {title && (
        <h1 className="hidden md:block text-sm font-medium text-ink-secondary">
          {title}
        </h1>
      )}
      <div className="flex-1 max-w-xl">
        <div className="hidden md:flex items-center gap-2.5 px-3 h-9 rounded-sm border border-line-soft bg-surface text-sm text-ink-tertiary cursor-text hover:border-line-strong transition-colors">
          <Search className="w-4 h-4" strokeWidth={1.75} />
          <span>Search villas, bookings, statements…</span>
          <kbd className="ml-auto text-[10px] tracking-wider text-ink-tertiary px-1.5 py-0.5 rounded bg-muted border border-line-soft">
            ⌘K
          </kbd>
        </div>
      </div>
      <div className="ml-auto flex items-center gap-2">
        <Link
          href="/dashboard/ai"
          className="hidden sm:inline-flex items-center gap-1.5 h-9 px-3 rounded-sm border border-line-soft bg-surface hover:bg-muted text-sm text-ink transition-colors"
        >
          <Sparkles className="w-4 h-4 text-gold" strokeWidth={1.75} />
          <span>Assistants</span>
        </Link>
        <Link
          href="/dashboard/notifications/inbox"
          className="h-9 rounded-sm border border-line-soft bg-surface hover:bg-muted inline-flex items-center justify-center transition-colors relative px-2.5 gap-1.5"
          aria-label={`Inbox · ${unreadCount} unread`}
        >
          <Bell className="w-4 h-4 text-ink-secondary" strokeWidth={1.75} />
          {unreadCount > 0 && (
            <span className="text-[10px] font-mono tabular-nums px-1.5 py-0.5 rounded-full bg-gold-weak text-gold">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </Link>
        <button className="h-9 w-9 rounded-full bg-ink text-ink-inverse text-sm font-medium inline-flex items-center justify-center">
          NR
        </button>
      </div>
    </header>
  );
}
