import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Phase 2.1 PR 1 — Foundations.
 *
 * EmptyState now supports TWO APIs that coexist:
 *
 *  A) NEW (template 02) — pass `variant`. Renders the
 *     `[data-product] .empty` class-based markup from
 *     `_handoff/templates/empty-state.html`. Five variants × glyph
 *     tone, plus `.inline` and `.narrative` modifiers.
 *
 *  B) LEGACY (Stage 10.6.C.3) — omit `variant`. Renders the
 *     Tailwind-class-based design used by ~50 existing callsites
 *     (dashed bordered card with optional gradient `tone`).
 *
 * The split is intentional: PR 1 ships the foundation primitive
 * without forcing a sweeping migration of every existing empty
 * surface. Phase 2.2 callsites adopt `variant`; legacy callsites
 * migrate opportunistically.
 */

// ---------- NEW API (template 02) ----------

export type EmptyStateVariant =
  | "first-run"
  | "no-results"
  | "caught-up"
  | "restricted"
  | "error";

type GlyphTone = "accent" | "ok" | "warn" | "neutral";

const VARIANT_TONE: Record<EmptyStateVariant, GlyphTone> = {
  "first-run": "accent",
  "no-results": "neutral",
  "caught-up": "ok",
  restricted: "warn",
  error: "warn",
};

// Default glyphs per variant — inline SVGs, no external dep.
function DefaultGlyph({ variant }: { variant: EmptyStateVariant }) {
  switch (variant) {
    case "first-run":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <line x1="16" y1="2" x2="16" y2="6" />
          <line x1="8" y1="2" x2="8" y2="6" />
          <line x1="3" y1="10" x2="21" y2="10" />
          <line x1="12" y1="14" x2="12" y2="18" />
          <line x1="10" y1="16" x2="14" y2="16" />
        </svg>
      );
    case "no-results":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      );
    case "caught-up":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      );
    case "restricted":
      return (
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      );
    case "error":
      return (
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
          <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          <line x1="12" y1="9" x2="12" y2="13" />
          <line x1="12" y1="17" x2="12.01" y2="17" />
        </svg>
      );
  }
}

export interface EmptyStateNewProps {
  variant: EmptyStateVariant;
  title: React.ReactNode;
  body?: React.ReactNode;
  actions?: React.ReactNode;
  /** Override the default glyph for this variant. */
  icon?: React.ReactNode;
  /** Row layout for use inside cards / tight surfaces. */
  inline?: boolean;
  /** Bigger, calmer (Owner Portal). */
  narrative?: boolean;
  /** Mono footer line for error refs / timestamps. */
  meta?: string;
  className?: string;
}

// ---------- LEGACY API (preserved for back-compat) ----------

export type EmptyStateTone =
  | "default"
  | "soft"
  | "emerald"
  | "gold"
  | "coral";

const LEGACY_TONE_CLS: Record<EmptyStateTone, string> = {
  default:
    "rounded-md border border-dashed border-line-soft bg-muted/30 px-8 py-14",
  soft:
    "rounded-3xl border border-line-soft bg-surface shadow-soft-card px-8 py-16",
  emerald:
    "rounded-3xl border border-line-soft bg-gradient-emerald-soft shadow-soft-card px-8 py-16",
  gold:
    "rounded-3xl border border-line-soft bg-gradient-gold-soft shadow-soft-card px-8 py-16",
  coral:
    "rounded-3xl border border-line-soft bg-gradient-coral-soft shadow-soft-card px-8 py-16",
};

export interface EmptyStateLegacyProps {
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
  tone?: EmptyStateTone;
}

// ---------- Union + dispatcher ----------

export type EmptyStateProps =
  | (EmptyStateNewProps & { variant: EmptyStateVariant })
  | (EmptyStateLegacyProps & { variant?: undefined });

function isNewApi(p: EmptyStateProps): p is EmptyStateNewProps & { variant: EmptyStateVariant } {
  return (p as EmptyStateNewProps).variant !== undefined;
}

export function EmptyState(props: EmptyStateProps) {
  if (isNewApi(props)) {
    const { variant, title, body, actions, icon, inline, narrative, meta, className } = props;
    const tone = VARIANT_TONE[variant];
    return (
      <div
        className={cn(
          "empty",
          inline && "inline",
          narrative && "narrative",
          className
        )}
        data-variant={variant}
      >
        <div className={cn("glyph", tone !== "neutral" && tone)}>
          {icon ?? <DefaultGlyph variant={variant} />}
        </div>
        <h3>{title}</h3>
        {body !== undefined && body !== null && <p>{body}</p>}
        {actions && <div className="actions">{actions}</div>}
        {meta && <div className="meta">{meta}</div>}
      </div>
    );
  }

  // Legacy render.
  const { icon, title, description, action, className, tone = "default" } = props;

  // The plain `default` tone now renders the design-system `.empty` block —
  // the same mock-matched markup the variant API (and ~200 other EmptyState
  // callsites) already use — so the common empty surface is consistent
  // everywhere. The richer gradient tones (soft/emerald/gold/coral) keep their
  // distinctive cards (intentional on the owner/marketing surfaces).
  if (tone === "default") {
    return (
      <div className={cn("empty", className)} data-variant="no-results">
        <div className="glyph">{icon ?? <DefaultGlyph variant="no-results" />}</div>
        <h3>{title}</h3>
        {description !== undefined && description !== null && <p>{description}</p>}
        {action && <div className="actions">{action}</div>}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center text-center",
        LEGACY_TONE_CLS[tone],
        className
      )}
    >
      {icon && (
        <div className="mb-4 w-12 h-12 rounded-full bg-surface flex items-center justify-center border border-line-soft text-ink-tertiary shadow-soft-card">
          {icon}
        </div>
      )}
      <h3 className="text-base md:text-lg font-medium text-ink mb-1">{title}</h3>
      {description && (
        <p className="text-sm text-ink-secondary max-w-sm leading-relaxed">
          {description}
        </p>
      )}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
