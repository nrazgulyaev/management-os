import * as React from "react";

/**
 * <AuthShell> — the two-column auth layout brick.
 *
 * Pixel-ported from the canonical mockup
 * (cc-functional-handoff/auth/Auth Suite.html · auth-screens.jsx).
 * One shell, six platforms, three brand-panel tones — the tone is a
 * PROP, not six copies (per the auth-suite prompt gotcha).
 *
 * All styling comes from `.auth-*` classes in
 * src/styles/components/auth.css (Layer-B token-only, scoped under
 * [data-product]). No `style={{}}`, no raw hex.
 *
 * The shell is presentational only — every form/server-action lives in
 * the page's own `children` (preserving the existing data wiring).
 */

export type AuthTone = "warm" | "premium" | "editorial";

export interface AuthTestimonial {
  quote: string;
  who: string;
}

export interface AuthStat {
  k: string;
  v: string;
}

const BrandMark = ({ size = 26 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
    <path d="M16 4 L28 14 H24 L16 8 L8 14 H4 Z" fill="currentColor" />
    <path
      d="M16 13 L25 20 H21.5 L16 16 L10.5 20 H7 Z"
      fill="currentColor"
      opacity="0.62"
    />
    <path d="M16 21 L22 25.5 H10 Z" fill="currentColor" opacity="0.34" />
  </svg>
);

function AuthLogo({ wordmark, sub }: { wordmark: string; sub: string }) {
  return (
    <div className="auth-logo">
      <span className="auth-logo-mark">
        <BrandMark />
      </span>
      <div className="auth-logo-text">
        <div className="auth-logo-word">{wordmark}</div>
        <div className="auth-logo-sub">{sub}</div>
      </div>
    </div>
  );
}

function BrandPanel({
  tone,
  kicker,
  testimonial,
  stats,
}: {
  tone: AuthTone;
  kicker: string;
  testimonial?: AuthTestimonial | null;
  stats?: AuthStat[] | null;
}) {
  const body = testimonial ? (
    <>
      <p className="auth-panel-quote">&ldquo;{testimonial.quote}&rdquo;</p>
      <p className="auth-panel-who">&mdash; {testimonial.who}</p>
    </>
  ) : stats ? (
    <div className="auth-panel-stats">
      {stats.map((s) => (
        <div key={s.k}>
          <div className="auth-panel-stat-v">{s.v}</div>
          <div className="auth-panel-stat-k">{s.k}</div>
        </div>
      ))}
    </div>
  ) : null;

  if (tone === "premium") {
    return (
      <div className="auth-panel auth-panel-premium">
        <div className="auth-panel-glow" />
        <div className="auth-panel-grid" />
        <div className="auth-panel-inner">
          <span className="auth-panel-kicker">{kicker}</span>
          {body}
        </div>
      </div>
    );
  }

  if (tone === "editorial") {
    return (
      <div className="auth-panel auth-panel-editorial">
        <div className="auth-photo" />
        <div className="auth-photo-veil" />
        <div className="auth-panel-inner">
          <span className="auth-panel-kicker">{kicker}</span>
          {body}
          <span className="auth-photo-tag">villa photography</span>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-panel auth-panel-warm">
      <div className="auth-panel-inner">
        <span className="auth-panel-kicker">{kicker}</span>
        {body}
      </div>
    </div>
  );
}

export function AuthShell({
  dataProduct,
  wordmark = "Arconique",
  wordmarkSub,
  tone = "warm",
  panelKicker,
  testimonial,
  stats,
  footer,
  children,
}: {
  dataProduct: string;
  wordmark?: string;
  wordmarkSub: string;
  tone?: AuthTone;
  panelKicker: string;
  testimonial?: AuthTestimonial | null;
  stats?: AuthStat[] | null;
  footer?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="auth-shell" data-product={dataProduct}>
      <div className="auth-form-col">
        <div className="auth-form-top">
          <AuthLogo wordmark={wordmark} sub={wordmarkSub} />
        </div>
        <div className="auth-form-mid">
          <div className="auth-form-box">{children}</div>
        </div>
        <div className="auth-form-foot">{footer}</div>
      </div>
      <BrandPanel
        tone={tone}
        kicker={panelKicker}
        testimonial={testimonial}
        stats={stats}
      />
    </div>
  );
}

/** Eyebrow + display headline pair used at the top of each auth screen. */
export function AuthHead({
  eyebrow,
  children,
}: {
  eyebrow: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <span className="auth-eyebrow">{eyebrow}</span>
      <h1 className="auth-title">{children}</h1>
    </>
  );
}
