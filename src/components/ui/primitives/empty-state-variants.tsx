/**
 * Stage 10.D.3 — Empty-state variants.
 *
 * The audit found 9 EMPTY-LEAKY pages surfacing developer instructions
 * + 37 EMPTY-OK pages with no Add CTA. Stage 10.B-CLEANUP replaced the
 * leaks; Stage 10.D ships these standard empty-state shapes so every
 * future list page has a consistent look + helpful CTA.
 *
 * Three variants:
 *   - <NoItemsYet>            — first-run; shows a prominent Add CTA
 *   - <NoMatchingResults>     — search/filter returned 0; offers reset
 *   - <ConfigurationRequired> — feature requires setup before use
 *
 * All wrap the existing `<EmptyState>` (src/components/ui/empty-state.tsx).
 * Server-safe.
 */

import * as React from "react";
import Link from "next/link";
import { EmptyState, type EmptyStateTone } from "@/components/ui/empty-state";
import { Inbox, Search, Settings, Plus } from "lucide-react";

/**
 * First-time empty state. Pair with an Add CTA so the operator can act.
 *
 * Pass either `addHref` (for `/new` flows) OR `addAction` (a client
 * component that opens an EntityFormModal).
 */
export function NoItemsYet({
  entityLabel,
  description,
  addHref,
  addLabel,
  addAction,
  tone,
}: {
  /** Plural noun, e.g. "vendors", "lead sources". */
  entityLabel: string;
  description?: string;
  addHref?: string;
  addLabel?: string;
  /** Client-component slot for EntityFormModal-driven Add. */
  addAction?: React.ReactNode;
  /**
   * Stage 10.6.C.3 — pass-through tone for the underlying EmptyState.
   * Defaults to "default" (dashed muted look). Use "soft" for friendlier
   * card-style emptiness; "emerald" / "gold" / "coral" for first-run
   * gradient accent (use sparingly).
   */
  tone?: EmptyStateTone;
}) {
  const action =
    addAction ??
    (addHref ? (
      <Link
        href={addHref}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-sm bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
      >
        <Plus className="w-4 h-4" />
        {addLabel ?? `Add ${entityLabel.replace(/s$/, "")}`}
      </Link>
    ) : undefined);

  return (
    <EmptyState
      icon={<Inbox className="w-5 h-5" />}
      title={`No ${entityLabel} yet`}
      description={
        description ??
        `Add your first ${entityLabel.replace(/s$/, "")} to get started.`
      }
      action={action}
      tone={tone}
    />
  );
}

/**
 * Filter / search returned no rows. Suggest clearing filters.
 */
export function NoMatchingResults({
  searchTerm,
  onReset,
  resetHref,
}: {
  /** What the user searched for (rendered in the body if provided). */
  searchTerm?: string;
  /** Click handler for "Clear filters" — provide ONE of onReset / resetHref. */
  onReset?: () => void;
  resetHref?: string;
}) {
  const action = onReset ? (
    <button
      type="button"
      onClick={onReset}
      className="inline-flex items-center px-4 py-2 rounded-sm border border-line-soft bg-surface text-ink text-sm font-medium hover:bg-muted"
    >
      Clear filters
    </button>
  ) : resetHref ? (
    <Link
      href={resetHref}
      className="inline-flex items-center px-4 py-2 rounded-sm border border-line-soft bg-surface text-ink text-sm font-medium hover:bg-muted"
    >
      Clear filters
    </Link>
  ) : undefined;

  return (
    <EmptyState
      icon={<Search className="w-5 h-5" />}
      title="No matching results"
      description={
        searchTerm
          ? `No items matched "${searchTerm}". Try a broader query or clear active filters.`
          : "Try a broader query or clear active filters."
      }
      action={action}
    />
  );
}

/**
 * Feature surfaces something the operator must configure before any
 * data exists (e.g. "set a Stripe key", "register a webhook URL").
 */
export function ConfigurationRequired({
  title,
  description,
  ctaHref,
  ctaLabel,
}: {
  title: string;
  description: string;
  ctaHref: string;
  ctaLabel: string;
}) {
  return (
    <EmptyState
      icon={<Settings className="w-5 h-5" />}
      title={title}
      description={description}
      action={
        <Link
          href={ctaHref}
          className="inline-flex items-center px-4 py-2 rounded-sm bg-ink text-ink-inverse text-sm font-medium hover:bg-ink/90"
        >
          {ctaLabel}
        </Link>
      }
    />
  );
}
