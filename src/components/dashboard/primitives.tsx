import * as React from "react";

/**
 * Sprint _handoff/ Task 5 — shared dashboard primitives.
 *
 * Server-safe React components used by both Management OS and
 * Development OS cabinets. They render the prototype's `.kpi`,
 * `.card`, `.badge`, `.pulse-dot` and section-heading classes
 * defined in `src/app/globals.css` under the `[data-product]`
 * scopes, so a single component renders correctly under either
 * product surface.
 *
 * Living in one file because each piece is small (3-15 lines) and
 * always co-imported in cabinet pages — keeping them together
 * reduces import churn. If any grows beyond ~30 lines, split it
 * into its own file.
 */

interface KpiProps {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  /** Tints the value via CSS class — `accent`/`success`/`warn`/`danger`/`gold`. */
  tone?: "accent" | "success" | "warn" | "danger" | "gold";
}
export function Kpi({ label, value, sub, tone }: KpiProps) {
  return (
    <div className={"kpi" + (tone ? ` ${tone}` : "")}>
      <div className="label">{label}</div>
      <div className="v">{value}</div>
      {sub != null && <div className="sub">{sub}</div>}
    </div>
  );
}

interface SectionHeadingProps {
  eyebrow?: string;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}
export function SectionHeading({
  eyebrow,
  title,
  subtitle,
  actions,
}: SectionHeadingProps) {
  return (
    <div className="flex items-end gap-[18px] mb-[22px]">
      <div className="flex-1 min-w-0">
        {eyebrow && <div className="label">{eyebrow}</div>}
        <h1 className="display text-[42px] mt-1.5 mb-0 font-normal">
          {title}
        </h1>
        {subtitle != null && (
          <p className="mt-2 mb-0 text-[15px] text-[var(--ink-3,var(--ink-tertiary))] max-w-[680px]">
            {subtitle}
          </p>
        )}
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Anchor target for in-page nav (e.g. `id="statements"` matches the
   *  `#statements` href in the sidebar). */
  id?: string;
  /** Optional tone-tinted background. `dark` = inverted dark card
   *  (Mgmt: forest-deep; Dev: ink), used for the editorial AI band
   *  cards. */
  tone?: "default" | "dark";
  /** Phase 2.0.5 — padding preset. Default is `none` for backward
   *  compatibility (existing 174 callsites pass `style={{padding: N}}`
   *  explicitly). New code should opt in: `padding="default"` =
   *  20px / 18px, `padding="lg"` = 26px / 22px, `padding="tight"` =
   *  18px / 14px. Inline `style.padding` always wins. */
  padding?: "none" | "tight" | "default" | "lg";
  /** Phase 2.0.5 — shorthand for `overflow: hidden`. Pairs with
   *  `padding="none"` + a child header + table pattern. Inline
   *  `style.overflow` always wins. */
  overflowHidden?: boolean;
}
export function Card({
  children,
  className,
  style,
  id,
  tone = "default",
  padding = "none",
  overflowHidden = false,
}: CardProps) {
  const paddingClass =
    padding === "tight"
      ? "px-[18px] py-[14px]"
      : padding === "default"
      ? "px-5 py-[18px]"
      : padding === "lg"
      ? "px-[26px] py-[22px]"
      : "";

  const classes = [
    "card",
    paddingClass,
    overflowHidden && "overflow-hidden",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      id={id}
      className={classes}
      style={
        tone === "dark"
          ? {
              background: "var(--forest-deep, var(--ink))",
              color: "var(--cream-warm, var(--paper))",
              ...style,
            }
          : style
      }
    >
      {children}
    </div>
  );
}

interface HandoffBadgeProps {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "danger" | "gold" | "info" | "ink";
}
/** Layer B (handoff) badge — pill-shaped, mono-font, per-product
 *  palette via the `.badge` CSS classes in src/styles/components.css.
 *  Distinct from src/components/ui/badge.tsx (Layer A, 439 imports,
 *  Tailwind-class based). Use this one only on handoff-ported pages. */
export function HandoffBadge({ children, tone }: HandoffBadgeProps) {
  return (
    <span className={"badge" + (tone ? ` badge-${tone}` : "")}>{children}</span>
  );
}

/** Animated pulse dot. Color picks up the product palette via
 *  `.pulse-dot` in src/styles/components.css (mgmt → --ok, dev →
 *  --amber, subscription → --terra). Use inside a `.label`-styled
 *  line for the prototype's `● live` cadence. */
export function Pulse() {
  return <span className="pulse-dot" aria-hidden />;
}
