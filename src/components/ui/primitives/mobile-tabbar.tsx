"use client";

/**
 * Arconique OS redesign — MobileTabbar primitive.
 *
 * 5–6 icon-only buttons fixed to the bottom of the viewport, with a
 * blurred near-white background. Replaces the sidebar at ≤720px.
 *
 * Reference: design_handoff_arconique_os/COMPONENTS.md §12.
 *
 * Uses Next's `usePathname()` to auto-highlight the active tab so
 * each cabinet just renders the tabbar at its shell level — no need
 * to thread an `active` prop through every page.
 *
 * Each item is a `<Link>` so the browser back/forward + middle-click
 * "open in new tab" all keep working.
 */

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export interface MobileTabbarItem {
  /** Destination path; the tabbar marks the item active when the
   *  pathname starts with this prefix. */
  href: string;
  /** Icon component (lucide-react, etc.). */
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  /** Accessible label / sr-only text. */
  label: string;
}

export interface MobileTabbarProps {
  items: MobileTabbarItem[];
  /** Optional className for the fixed bar wrapper. */
  className?: string;
}

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}

export function MobileTabbar({ items, className }: MobileTabbarProps) {
  const pathname = usePathname() ?? "";
  return (
    <nav
      aria-label="Primary mobile navigation"
      className={cn(
        "md:hidden fixed inset-x-0 bottom-0 z-40",
        "px-3 pb-3 pt-2",
        "pointer-events-none",
        className,
      )}
      data-primitive="mobile-tabbar"
    >
      <ul
        className={cn(
          "pointer-events-auto",
          "mx-auto max-w-md flex items-stretch justify-around",
          "rounded-full border border-line bg-[rgba(255,255,255,0.92)]",
          "backdrop-blur-md shadow-redesign-pop",
          "px-3 py-2",
        )}
      >
        {items.map((item) => {
          const Icon = item.icon;
          const active = isActive(pathname, item.href);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "grid place-items-center w-11 h-11 mx-auto rounded-full transition-colors",
                  active
                    ? "bg-ink-deep text-white"
                    : "text-ink-3 hover:text-ink",
                  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-terra",
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
                <span className="sr-only">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
