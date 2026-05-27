/**
 * Phase 2.1 PR 3 — Command palette shared types.
 *
 * Three result kinds the palette can render:
 *
 *   - navigation  → cabinet jumps (label + href)
 *   - action      → contextual verbs (label + kbd + run)
 *   - record      → fuzzy-searched entities (label + meta + href)
 *
 * Per-cabinet `commandActions` modules export `CommandAction[]` from
 * a `_command-actions.ts` file co-located with the route's
 * `page.tsx`. The palette dynamically imports them based on the
 * current pathname so the bundle stays small.
 */

import type { Router } from "next/router";

export interface CommandActionContext {
  /** Next App Router instance. */
  router: { push: (href: string) => void; replace: (href: string) => void } | Router;
  /** Current pathname (mirror of usePathname()). */
  pathname: string;
  /** Closes the palette. Useful when the action should not navigate
   *  but still dismisses the UI. */
  close: () => void;
}

export interface CommandAction {
  id: string;
  label: string;
  /** Optional keyboard shortcut hint (rendered as a kbd chip). */
  kbd?: string;
  /** Render only when supplied — used for selection-aware actions. */
  meta?: string;
  /** Inline glyph (defaults to a generic action icon). */
  icon?: React.ReactNode;
  run: (ctx: CommandActionContext) => void | Promise<void>;
}

export interface CommandNavigation {
  id: string;
  label: string;
  href: string;
  /** Hint text shown next to the label (e.g. counts: "14 drafts"). */
  meta?: string;
  /** Optional g-key chord ("G F" for go-finance). Pure display. */
  kbd?: string;
  icon?: React.ReactNode;
}

export interface CommandRecord {
  id: string;
  label: string;
  href: string;
  /** Mono lower-line ("Booking · EV-07 · 27 May"). */
  meta?: string;
  /** Searchable haystack (label + code + meta fields concatenated). */
  haystack: string;
  /** Record kind discriminator ("booking", "villa", "owner", "statement", "project"). */
  kind: string;
  icon?: React.ReactNode;
}

export interface CommandSources {
  /** Selection / page-scoped actions (top group). */
  actions: CommandAction[];
  /** Recently opened — pulled from localStorage by the consumer. */
  recents?: CommandRecord[];
  /** Top-level cabinet jumps. */
  navigation: CommandNavigation[];
}
