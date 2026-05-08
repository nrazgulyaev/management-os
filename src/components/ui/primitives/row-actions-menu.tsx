/**
 * Stage 10.D.4 — RowActionsMenu primitive.
 *
 * Per-row kebab dropdown for list pages. Replaces the ad-hoc per-page
 * row-action layouts the audit catalogued — every list page should use
 * this for consistent Edit / Archive / Audit / Duplicate / Delete
 * affordances.
 *
 * Permission-aware: each item declares `permitted` (boolean); items
 * with `permitted: false` render disabled with a tooltip-friendly
 * `aria-disabled`. Items with `tone: "danger"` get destructive styling.
 *
 * Built on Radix DropdownMenu. Mobile fallback: when `mobileBottomSheet`
 * is true and a media-query indicates touch / narrow viewport, the
 * dropdown renders as a full-width bottom sheet (more thumb-friendly).
 *
 * Used by: 10.E CRUD rollout (40+ list pages).
 */
"use client";

import * as React from "react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

export type RowActionTone = "neutral" | "danger";

export interface RowAction {
  id: string;
  label: string;
  /** Lucide icon component (or null). */
  icon?: React.ComponentType<{ className?: string }>;
  /** When false the item is shown disabled. */
  permitted?: boolean;
  tone?: RowActionTone;
  /** Sync or async — async actions show no busy state inside the menu;
   * close the menu and surface progress inline on the parent row. */
  onSelect: () => void | Promise<void>;
  /** Optional sub-text under the label. */
  description?: string;
  /** Force a separator above this item. */
  separatorBefore?: boolean;
}

export interface RowActionsMenuProps {
  actions: RowAction[];
  /** Aria label for the trigger; defaults to "Row actions". */
  triggerLabel?: string;
  /** Render the menu items in a mobile bottom sheet on small viewports. */
  mobileBottomSheet?: boolean;
  className?: string;
}

export function RowActionsMenu({
  actions,
  triggerLabel = "Row actions",
  mobileBottomSheet = true,
  className,
}: RowActionsMenuProps) {
  const visible = actions.filter((a) => a.permitted !== false || a.tone !== "danger" ? true : false);
  // Treat permitted=false as "show disabled" rather than hide, except for the
  // hidden case (which a parent can do by simply omitting the action).
  void visible;

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={triggerLabel}
          className={cn(
            "inline-flex items-center justify-center w-8 h-8 rounded-sm text-ink-tertiary hover:bg-muted hover:text-ink focus-visible:outline-2 focus-visible:outline-line-strong",
            className,
          )}
        >
          <MoreHorizontal className="w-4 h-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={6}
          className={cn(
            "z-50 min-w-[180px] rounded-md bg-surface border border-line-soft shadow-[var(--shadow-floating)] py-1 text-sm",
            mobileBottomSheet &&
              "max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 max-sm:translate-y-0 max-sm:min-w-0 max-sm:rounded-t-md max-sm:rounded-b-none max-sm:py-2",
          )}
          data-stage10="row-actions-menu"
        >
          {actions.map((action, idx) => {
            const Icon = action.icon;
            const disabled = action.permitted === false;
            const isDestructive = action.tone === "danger";
            return (
              <React.Fragment key={action.id}>
                {action.separatorBefore && idx > 0 && (
                  <DropdownMenu.Separator className="h-px bg-line-soft my-1" />
                )}
                <DropdownMenu.Item
                  onSelect={(e) => {
                    if (disabled) {
                      e.preventDefault();
                      return;
                    }
                    void action.onSelect();
                  }}
                  disabled={disabled}
                  className={cn(
                    "flex items-start gap-2 px-3 py-2 cursor-pointer outline-none",
                    "data-[highlighted]:bg-muted",
                    disabled && "opacity-50 cursor-not-allowed",
                    isDestructive && !disabled && "text-danger data-[highlighted]:bg-danger-weak/40",
                  )}
                  data-action-id={action.id}
                  data-tone={action.tone ?? "neutral"}
                  aria-disabled={disabled}
                >
                  {Icon && <Icon className="w-4 h-4 mt-0.5 shrink-0" />}
                  <span className="flex flex-col min-w-0">
                    <span className="font-medium truncate">{action.label}</span>
                    {action.description && (
                      <span className="text-xs text-ink-tertiary truncate">
                        {action.description}
                      </span>
                    )}
                  </span>
                </DropdownMenu.Item>
              </React.Fragment>
            );
          })}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
