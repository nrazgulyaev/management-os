/**
 * Stage 5.J.2 — Pure white-label branding helpers.
 *
 * No I/O, no `import "server-only"`. Runtime testable.
 *
 * Converts an organization's `branding_config` JSONB into CSS custom
 * properties that can be injected into the page <head> at render time.
 */

export interface BrandingConfig {
  primary_color?: string;
  secondary_color?: string;
  logo_url?: string;
  logo_dark_url?: string;
  favicon_url?: string;
  email_from_name?: string;
  email_logo_url?: string;
}

const HEX_COLOR = /^#[0-9a-fA-F]{6}$/;

function isSafeColor(c: string | undefined): c is string {
  return !!c && HEX_COLOR.test(c);
}

/**
 * Render a `:root { --brand-…: …; }` stylesheet from a branding config.
 * Skips invalid colors silently — defends against XSS via crafted JSONB.
 */
export function renderBrandingCss(config: BrandingConfig | null): string {
  if (!config) return "";
  const declarations: string[] = [];
  if (isSafeColor(config.primary_color)) {
    declarations.push(`--brand-primary: ${config.primary_color};`);
  }
  if (isSafeColor(config.secondary_color)) {
    declarations.push(`--brand-secondary: ${config.secondary_color};`);
  }
  if (declarations.length === 0) return "";
  return `:root { ${declarations.join(" ")} }`;
}

/**
 * Returns the URL to use for the in-app logo. Falls back to the default
 * Arconique logo when no branding is configured.
 */
export function resolveLogoUrl(
  config: BrandingConfig | null,
  variant: "light" | "dark" = "light",
): string {
  const fallback = "/icons/icon-192x192.png";
  if (!config) return fallback;
  if (variant === "dark" && config.logo_dark_url) return config.logo_dark_url;
  if (config.logo_url) return config.logo_url;
  return fallback;
}

export function resolveFaviconUrl(config: BrandingConfig | null): string {
  return config?.favicon_url ?? "/favicon.svg";
}
