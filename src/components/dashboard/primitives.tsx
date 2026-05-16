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
  /** Tints the value via CSS class — `accent`/`success`/`gold`. */
  tone?: "accent" | "success" | "gold";
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
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 18,
        marginBottom: 22,
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        {eyebrow && <div className="label">{eyebrow}</div>}
        <h1
          className="display"
          style={{ fontSize: 42, margin: "6px 0 0", fontWeight: 400 }}
        >
          {title}
        </h1>
        {subtitle != null && (
          <p
            style={{
              margin: "8px 0 0",
              color: "var(--ink-3)",
              fontSize: 15,
              maxWidth: 680,
            }}
          >
            {subtitle}
          </p>
        )}
      </div>
      {actions && (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {actions}
        </div>
      )}
    </div>
  );
}

interface CardProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Optional tone-tinted background. `dark` = inverted dark card
   *  (Mgmt: forest-deep; Dev: ink), used for the editorial AI band
   *  cards. */
  tone?: "default" | "dark";
}
export function Card({ children, className, style, tone = "default" }: CardProps) {
  return (
    <div
      className={"card" + (className ? ` ${className}` : "")}
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

interface BadgeProps {
  children: React.ReactNode;
  tone?: "ok" | "warn" | "danger" | "gold" | "info" | "ink";
}
export function Badge({ children, tone }: BadgeProps) {
  return (
    <span className={"badge" + (tone ? ` badge-${tone}` : "")}>{children}</span>
  );
}

/** Animated pulse dot. Color picks up the product palette via
 *  `.pulse-dot` in globals.css (mgmt → --ok, dev → --amber,
 *  subscription → --terra). Use inside a `.label`-styled line for
 *  the prototype's `● live` cadence. */
export function Pulse() {
  return <span className="pulse-dot" aria-hidden />;
}
