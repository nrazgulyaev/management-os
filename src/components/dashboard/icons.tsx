/**
 * Sprint _handoff/ Task 5 — server-safe inline-SVG icon registry.
 *
 * Ported from `_handoff/_shared/mgmt-shell.html` icons.js block.
 * These are plain function components (not forwardRef like lucide),
 * which means they CAN be referenced from server modules and cross
 * the RSC boundary as JSX children — no HF-12 component-via-config
 * concern.
 *
 * Sidebar/topbar consume them via a string lookup so the nav config
 * (`src/config/dashboard-nav.ts`) stays JSON-shaped — see
 * `DashboardIcon` below.
 *
 * Single source of truth for both Mgmt and Dev sidebars. Group icons
 * cover both products' nav trees; specific Dev-only icons (hammer,
 * blueprint, etc.) live at the bottom of the registry.
 */

import * as React from "react";

type IconProps = {
  width?: number | string;
  height?: number | string;
  className?: string;
  strokeWidth?: number;
};

const stroke = (p: IconProps) => ({
  width: p.width ?? 18,
  height: p.height ?? 18,
  className: p.className,
  strokeWidth: p.strokeWidth ?? 1.5,
});

export const ICONS = {
  // Chrome
  search: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <circle cx="11" cy="11" r="7" />
      <path d="M21 21l-4.3-4.3" />
    </svg>
  ),
  bell: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M6 8a6 6 0 1 1 12 0c0 5 2 7 2 7H4s2-2 2-7zM10 19a2 2 0 0 0 4 0" />
    </svg>
  ),
  sparkles: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M12 3v4m0 10v4M3 12h4m10 0h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />
    </svg>
  ),
  logo: (p: IconProps = {}) => (
    <svg viewBox="0 0 32 32" fill="none" {...stroke(p)}>
      <path d="M16 4 L26 22 H6 Z" stroke="currentColor" fill="none" />
      <path d="M11 22 L16 13 L21 22" stroke="currentColor" fill="none" />
    </svg>
  ),
  logoMark: (p: IconProps = {}) => (
    <svg viewBox="0 0 32 32" fill="none" {...stroke(p)}>
      <rect x="4" y="4" width="24" height="24" stroke="currentColor" />
      <path d="M10 22 V12 H22 M10 17 H22" stroke="currentColor" />
    </svg>
  ),

  // Group icons (Mgmt)
  home: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M4 11l8-7 8 7v9a2 2 0 0 1-2 2h-3v-6h-6v6H6a2 2 0 0 1-2-2v-9z" />
    </svg>
  ),
  port: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M3 21V8l9-5 9 5v13M9 21v-7h6v7" />
    </svg>
  ),
  people: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <circle cx="9" cy="8" r="4" />
      <path d="M17 11a3 3 0 1 0 0-6M3 20c1.5-3 4-5 6-5s4.5 2 6 5M16 20c1-2 3-3 5-3" />
    </svg>
  ),
  cal: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  ),
  guest: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M3 21V11l9-7 9 7v10M9 21v-6h6v6" />
    </svg>
  ),
  msg: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M21 12a8 8 0 0 1-12.2 6.8L3 20l1.2-5.8A8 8 0 1 1 21 12z" />
    </svg>
  ),
  bed: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M3 18V8m0 6h18m0 0v4m0-4v-2a3 3 0 0 0-3-3h-5v5M3 8h6" />
    </svg>
  ),
  wrench: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M14 5l5 5-9 9-5-5 9-9zM12 7l5 5M3 21l3-3" />
    </svg>
  ),
  bolt: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" />
    </svg>
  ),
  shield: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M12 3l8 3v5c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-3z" />
    </svg>
  ),
  link: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1.5 1.5M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1.5-1.5" />
    </svg>
  ),
  receipt: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M5 3v18l3-2 3 2 3-2 3 2 3-2V3l-3 2-3-2-3 2-3-2-3 2zM9 9h6M9 13h6" />
    </svg>
  ),
  chart: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M4 20V8M10 20V4M16 20v-8M22 20H2" />
    </svg>
  ),
  cog: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <circle cx="12" cy="12" r="3" />
      <path d="M19 12a7 7 0 0 0-.1-1.2l2-1.5-2-3.5-2.4 1a7 7 0 0 0-2.1-1.2l-.4-2.6h-4l-.4 2.6a7 7 0 0 0-2.1 1.2l-2.4-1-2 3.5 2 1.5A7 7 0 0 0 5 12a7 7 0 0 0 .1 1.2l-2 1.5 2 3.5 2.4-1a7 7 0 0 0 2.1 1.2l.4 2.6h4l.4-2.6a7 7 0 0 0 2.1-1.2l2.4 1 2-3.5-2-1.5A7 7 0 0 0 19 12z" />
    </svg>
  ),
  doc: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5" />
    </svg>
  ),
  pkg: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M21 16V8a2 2 0 0 0-1-1.7l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.7l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16zM3.3 7L12 12l8.7-5M12 22V12" />
    </svg>
  ),
  audit: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  ),

  // Dev-specific group icons
  hammer: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <path d="M14 5l5 5-9 9-5-5 9-9zM3 21l3-3" />
    </svg>
  ),
  spreadsheet: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <rect x="3" y="4" width="18" height="16" rx="1" />
      <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
    </svg>
  ),
  truck: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <rect x="2" y="8" width="11" height="9" />
      <path d="M13 11h5l3 3v3h-8M5 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4zM17 21a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" />
    </svg>
  ),
  briefcase: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <rect x="3" y="7" width="18" height="13" rx="2" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  ),
  building: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <rect x="4" y="3" width="16" height="18" />
      <path d="M9 8h2M13 8h2M9 12h2M13 12h2M9 16h6" />
    </svg>
  ),
  radar: (p: IconProps = {}) => (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" {...stroke(p)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 3v9l6 6" />
    </svg>
  ),
} as const;

export type IconKey = keyof typeof ICONS;

/** Server-safe lookup. Returns null when key is unknown (e.g. nav
 *  config drifts ahead of the icon registry) — caller renders a
 *  pixel placeholder so layout stays stable. */
export function DashboardIcon({
  name,
  ...rest
}: { name?: IconKey } & Omit<IconProps, "name">) {
  if (!name) return null;
  const Icon = ICONS[name];
  if (!Icon) return null;
  return <Icon {...rest} />;
}
