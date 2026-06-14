import Link from "next/link";

/**
 * Investor-portal inner-view primitives — pixel-matched to the LP mock
 * (`Investor Portal.html`). The portal runs the Dev OS engineering palette
 * (`data-product="development"` / `data-surface="investor-portal"`), so these
 * presentational pieces use only Layer-B tokens + the `.display` / `.label`
 * / `.tnum` helpers — never raw hex. Pure server components: no client state,
 * so every page that renders capital-call / distribution / commitment data can
 * compose them without forcing a client boundary.
 *
 * The mock's `.kpi`, `.card`, `.sec-t`, `.page-h`, `table.data`, `.alert`,
 * `.badge`, `.prog` blocks map 1:1 onto the components below.
 */

/* ── Badge (mock `.badge .badge-*` pill) ──────────────────────────────────
 * The portal toolkit's previously-missing piece: pages imported the generic
 * Layer-A `@/components/ui/badge`, which isn't the mock's Layer-B pill. The
 * `.badge-ok|amber|warn|steel|ink` classes already exist under
 * `[data-product="development"]` (src/styles/components/primitives.css), so
 * this renders the mock pill directly. Accepts the same tone vocabulary the
 * old ui/badge sites passed, so the swap is a 1:1 component rename. */
const PORTAL_BADGE_TONE: Record<string, string> = {
  success: "badge-ok",
  ok: "badge-ok",
  warning: "badge-warn",
  warn: "badge-warn",
  danger: "badge-amber",
  amber: "badge-amber",
  gold: "badge-amber",
  accent: "badge-amber",
  info: "badge-steel",
  steel: "badge-steel",
  neutral: "badge-ink",
  ink: "badge-ink",
  outline: "badge-steel",
};
export function PortalBadge({
  tone = "neutral",
  children,
}: {
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <span className={"badge " + (PORTAL_BADGE_TONE[tone] ?? "badge-ink")}>
      {children}
    </span>
  );
}

/* ── Page header (eyebrow + Space-Grotesk h2 + sub) ───────────────────── */
export function PortalPageHeader({
  eyebrow,
  title,
  sub,
  actions,
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-[22px] flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <div className="label">{eyebrow}</div>
        <h2 className="display mt-1.5 text-[26px] font-medium tracking-[-0.02em] text-ink sm:text-[29px]">
          {title}
        </h2>
        {sub ? <p className="mt-1.5 text-[13.5px] text-ink-3">{sub}</p> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ── Detail page header (back-crumb + h2 + mono sub) ──────────────────── */
export function PortalDetailHeader({
  backHref,
  backLabel,
  title,
  sub,
  badge,
}: {
  backHref: string;
  backLabel: string;
  title: string;
  sub?: React.ReactNode;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-[22px]">
      <Link
        href={backHref}
        className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-ink-4 transition-colors hover:text-amber-deep"
      >
        ‹ {backLabel}
      </Link>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="display text-[26px] font-medium tracking-[-0.02em] text-ink sm:text-[29px]">
            {title}
          </h2>
          {sub ? <p className="mt-1.5 text-[13.5px] text-ink-3">{sub}</p> : null}
        </div>
        {badge}
      </div>
    </div>
  );
}

/* ── Card (white panel, dev r-card-lg + soft shadow) ──────────────────── */
export function PortalCard({
  children,
  className = "",
  pad = "default",
}: {
  children: React.ReactNode;
  className?: string;
  pad?: "default" | "lg" | "none";
}) {
  const padCls =
    pad === "lg" ? "p-7" : pad === "none" ? "" : "p-[22px]";
  return (
    <div
      className={`rounded-[18px] border border-line bg-panel shadow-soft-card ${padCls} ${className}`}
    >
      {children}
    </div>
  );
}

/* ── Section title row (Space-Grotesk h3 + optional link/badge) ───────── */
export function PortalSectionTitle({
  title,
  action,
  className = "",
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`mb-3.5 flex items-baseline justify-between gap-3 ${className}`}>
      <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
        {title}
      </h3>
      {action}
    </div>
  );
}

/* ── KPI tile — mono label / Space-Grotesk value / sub ────────────────── */
type KpiTone = "default" | "amber" | "dark";

export function PortalKpi({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: string;
  hint?: React.ReactNode;
  tone?: KpiTone;
}) {
  const shell =
    tone === "amber"
      ? "border-transparent bg-gradient-to-br from-amber to-amber-deep text-white"
      : tone === "dark"
        ? "border-carbon bg-carbon text-ink-inverse"
        : "border-line bg-panel";
  const labelCls =
    tone === "default" ? "text-ink-4" : "text-white/70";
  const valueCls = tone === "default" ? "text-ink" : "text-white";
  const hintCls = tone === "default" ? "text-ink-3" : "text-white/70";
  return (
    <div
      className={`rounded-[14px] border px-5 py-[18px] shadow-soft-card ${shell}`}
    >
      <div
        className={`font-mono text-[10px] uppercase tracking-[0.14em] ${labelCls}`}
      >
        {label}
      </div>
      <div
        className={`tnum mt-2 font-display text-[32px] font-medium leading-none tracking-[-0.02em] ${valueCls}`}
      >
        {value}
      </div>
      {hint ? (
        <div className={`mt-2 flex items-center gap-1.5 text-[12px] ${hintCls}`}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

/* ── Inverted alert band (carbon gradient + amber icon tile) ──────────── */
export function PortalAlert({
  icon,
  title,
  sub,
  actions,
}: {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-[18px] bg-gradient-to-br from-carbon-2 to-carbon px-5 py-[18px] text-ink-inverse shadow-soft-card">
      <span className="flex h-11 w-11 flex-none items-center justify-center rounded-xl bg-amber/20 text-amber-soft">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="font-display text-[16px] font-medium">{title}</div>
        {sub ? <div className="mt-0.5 text-[12.5px] text-ink-inverse/70">{sub}</div> : null}
      </div>
      {actions ? <div className="flex items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* ── Data table shell (mock `table.data`) ─────────────────────────────── */
export function PortalTableCard({
  title,
  action,
  children,
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[18px] border border-line bg-panel shadow-soft-card">
      {title ? (
        <div className="flex items-baseline justify-between gap-3 px-[22px] pb-2 pt-[22px]">
          <h3 className="font-display text-[17px] font-medium tracking-[-0.01em] text-ink">
            {title}
          </h3>
          {action}
        </div>
      ) : null}
      <table className="w-full border-collapse">{children}</table>
    </div>
  );
}

export function PortalTh({
  children,
  align = "left",
}: {
  children?: React.ReactNode;
  align?: "left" | "right";
}) {
  return (
    <th
      className={`border-b border-line px-4 pb-2.5 font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-ink-3 ${
        align === "right" ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

/* ── Key/value breakdown row (mock `brk()`) ───────────────────────────── */
export function PortalBreakdownRow({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-[7px]">
      <span className="text-[13px] text-ink-3">{label}</span>
      <span
        className={
          emphasis
            ? "tnum font-display text-[17px] font-semibold text-amber-deep"
            : "tnum text-[13px] text-ink-2"
        }
      >
        {value}
      </span>
    </div>
  );
}

/* ── Progress bar (mock `.prog`) ──────────────────────────────────────── */
export function PortalProgress({
  percent,
  tone = "amber",
}: {
  percent: number;
  tone?: "amber" | "steel" | "ok";
}) {
  const fill =
    tone === "steel" ? "bg-steel" : tone === "ok" ? "bg-ok" : "bg-amber";
  return (
    <div className="h-[7px] overflow-hidden rounded-[4px] bg-line-soft">
      <div
        className={`h-full rounded-[4px] ${fill}`}
        style={{ width: `${Math.max(0, Math.min(100, percent))}%` }}
      />
    </div>
  );
}

/* ── Empty / dashed state inside the engineering palette ──────────────── */
export function PortalEmpty({
  title,
  body,
}: {
  title: string;
  body?: string;
}) {
  return (
    <div className="rounded-[18px] border border-dashed border-line bg-panel px-6 py-10 text-center">
      <p className="text-sm font-medium text-ink-secondary">{title}</p>
      {body ? (
        <p className="mx-auto mt-2 max-w-md text-xs leading-relaxed text-ink-tertiary">
          {body}
        </p>
      ) : null}
    </div>
  );
}
