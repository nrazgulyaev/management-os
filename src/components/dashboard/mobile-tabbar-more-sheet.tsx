"use client";

/**
 * Phase 2.1 PR 1 — MobileTabbar "More" sheet (template 01).
 *
 * Radix Dialog with bottom-sheet positioning. Surfaces all the
 * cabinet nav items the 5-slot mobile tabbar can't fit. Lists every
 * group from the supplied `groups` prop (excluding items whose href
 * is one of the 4 primary tabs, since those already have direct
 * tabbar slots).
 */

import * as React from "react";
import Link from "next/link";
import * as Dialog from "@radix-ui/react-dialog";
import type { DashboardNavGroup } from "@/config/navigation/management";

export interface MobileTabbarMoreSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Full nav tree — the sheet filters out items already in the
   *  primary 4 tabs to avoid duplicates. */
  groups: DashboardNavGroup[];
  /** Primary tab hrefs to exclude (the 4 non-More slots). */
  primaryHrefs: readonly string[];
  title?: string;
}

export function MobileTabbarMoreSheet({
  open,
  onOpenChange,
  groups,
  primaryHrefs,
  title = "More cabinets",
}: MobileTabbarMoreSheetProps) {
  const skip = new Set(primaryHrefs);

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="more-sheet-overlay" />
        <Dialog.Content className="more-sheet" aria-label={title}>
          <div className="more-sheet-grab" aria-hidden />
          <Dialog.Title asChild>
            <h3>{title}</h3>
          </Dialog.Title>
          <Dialog.Description className="sr-only">
            Browse all cabinets not in the primary tab bar.
          </Dialog.Description>
          <nav className="more-sheet-groups">
            {groups.map((group) => {
              const items = group.items.filter((it) => !skip.has(it.href));
              if (items.length === 0) return null;
              return (
                <div className="more-sheet-group" key={group.title}>
                  <div className="more-sheet-group-title">{group.title}</div>
                  <ul>
                    {items.map((it) => (
                      <li key={it.href}>
                        <Link
                          href={it.href}
                          onClick={() => onOpenChange(false)}
                        >
                          {it.label}
                          {it.badge && (
                            <span className="more-sheet-badge">{it.badge}</span>
                          )}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
