import type { AuthTone, AuthTestimonial, AuthStat } from "./auth-shell";

/**
 * Per-platform auth copy + palette + brand-panel tone, ported from the
 * canonical mockup config (cc-functional-handoff/auth/auth-theme.jsx).
 *
 * `dataProduct` selects the Layer-B token scope (tokens.css). The
 * runtime `x-product` header (set by middleware) maps to one of these
 * keys; off-product hosts (preview/public) fall back to "management".
 */
export interface AuthPlatform {
  /** Layer-B token scope. */
  dataProduct: string;
  wordmarkSub: string;
  domain: string;
  badge: string;
  /** Sign-in headline, split into lead + emphasised tail. */
  headPre: string;
  headEm: string;
  sub: string;
  panelKicker: string;
  tone: AuthTone;
  testimonial?: AuthTestimonial | null;
  stats?: AuthStat[] | null;
  /** Affordances shown on the sign-in screen. */
  sso: boolean;
  signup: boolean;
}

export const AUTH_PLATFORMS: Record<string, AuthPlatform> = {
  management: {
    dataProduct: "management",
    wordmarkSub: "Management OS",
    domain: "management.arconique.com",
    badge: "Staff workspace",
    headPre: "Welcome ",
    headEm: "back.",
    sub: "Sign in to run today's property — bookings, owners, front office and on-site teams.",
    panelKicker: "Designed for trust",
    tone: "warm",
    testimonial: {
      quote:
        "The first villa-management platform that treats our owners like a family-office would.",
      who: "Director · Whitmore Villa Group",
    },
    sso: true,
    signup: true,
  },
  owner: {
    dataProduct: "owner",
    wordmarkSub: "Owner Portal",
    domain: "owner.arconique.com",
    badge: "Owner access",
    headPre: "Your villas, ",
    headEm: "in clear view.",
    sub: "Sign in to see statements, your calendar, and how the portfolio is performing.",
    panelKicker: "Calm, quarterly clarity",
    tone: "editorial",
    testimonial: {
      quote: "I finally understand my returns without three emails and a spreadsheet.",
      who: "Villa owner · Uluwatu",
    },
    sso: false,
    signup: false,
  },
  development: {
    dataProduct: "development",
    wordmarkSub: "Development OS",
    domain: "development.arconique.com",
    badge: "Staff workspace",
    headPre: "Build ",
    headEm: "with control.",
    sub: "Sign in to manage projects, BOQs, procurement, cashflow and site reporting.",
    panelKicker: "Engineering-grade",
    tone: "premium",
    testimonial: {
      quote: "Every variation, RFI and rupiah of cost — traceable down to the line item.",
      who: "Project Director · Bukit 7",
    },
    sso: true,
    signup: false,
  },
  investor: {
    dataProduct: "development",
    wordmarkSub: "Investor Portal",
    domain: "invest.arconique.com",
    badge: "Investor access",
    headPre: "Your capital, ",
    headEm: "transparent.",
    sub: "Sign in for distributions, capital calls, forecasts and project performance.",
    panelKicker: "Statement-grade reporting",
    tone: "premium",
    testimonial: {
      quote: "Quarterly clarity I used to chase for weeks now lives on a single screen.",
      who: "Limited Partner · Seminyak Fund I",
    },
    sso: false,
    signup: false,
  },
  buyer: {
    dataProduct: "development",
    wordmarkSub: "Buyer Portal",
    domain: "buyer.arconique.com",
    badge: "Buyer access",
    headPre: "Your home, ",
    headEm: "tracked.",
    sub: "Sign in to follow your unit's construction, payment ladder and documents.",
    panelKicker: "From foundation to keys",
    tone: "editorial",
    testimonial: {
      quote: "I watched my villa rise from foundation to handover — photo by photo.",
      who: "Buyer · Canggu Residence 04",
    },
    sso: false,
    signup: false,
  },
  subscription: {
    dataProduct: "subscription",
    wordmarkSub: "Arconique",
    domain: "arconique.com",
    badge: "Get started",
    headPre: "Two systems, ",
    headEm: "one platform.",
    sub: "Sign in to your Arconique workspace — Management OS and Development OS, together.",
    panelKicker: "One operating company",
    tone: "warm",
    testimonial: {
      quote: "Build it. Run it. Without switching browser tabs — or operating companies.",
      who: "Arconique",
    },
    sso: false,
    signup: true,
  },
  platform: {
    dataProduct: "platform",
    wordmarkSub: "Platform Admin OS",
    domain: "admin.arconique.com",
    badge: "Restricted",
    headPre: "System ",
    headEm: "control.",
    sub: "Operator access to organizations, AI agents, billing, usage and system health.",
    panelKicker: "Operator console",
    tone: "premium",
    testimonial: null,
    stats: [
      { k: "Organizations", v: "38" },
      { k: "Active agents", v: "112" },
      { k: "Uptime · 30d", v: "99.98%" },
    ],
    sso: true,
    signup: false,
  },
};

/**
 * Resolve a platform from the runtime `x-product` header. Off-product
 * hosts (preview/public) get the management palette so the design
 * (palette + display typeface) always resolves — `subscription` and
 * `platform` are NOT defined as Layer-B token scopes, so they fall
 * back to management for token resolution while keeping their copy.
 */
export function resolveAuthPlatform(product: string | null | undefined): AuthPlatform {
  const plat = (product && AUTH_PLATFORMS[product]) || AUTH_PLATFORMS.management;
  return plat;
}

/** Token scopes that actually exist in Layer B (tokens.css). */
const TOKEN_SCOPES = new Set([
  "management",
  "owner",
  "development",
  "subscription",
]);

/** Pick a real Layer-B token scope; everything else defaults to management. */
export function resolveTokenProduct(dataProduct: string): string {
  return TOKEN_SCOPES.has(dataProduct) ? dataProduct : "management";
}
