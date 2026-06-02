/* Auth prototype — platform themes, tones, copy.
   Exposed on window for the screens + app files. */

// Each platform = a bespoke sign-in identity. dataProduct picks the
// Layer B token set; `variant` lets investor/buyer diverge from dev.
const AUTH_PLATFORMS = {
  management: {
    key: "management",
    dataProduct: "management",
    label: "Management OS",
    badge: "Staff workspace",
    domain: "management.arconique.com",
    wordmark: "Arconique",
    wordmarkSub: "Management OS",
    headline: ["Welcome ", "back."],
    sub: "Sign in to run today's property — bookings, owners, front office and on-site teams.",
    testimonial: {
      quote: "The first villa-management platform that treats our owners like a family-office would.",
      who: "Director · Whitmore Villa Group",
    },
    panelKicker: "Designed for trust",
    accent: "var(--terra)",
    links: { signup: true, mfa: true, bootstrap: true, sso: true },
  },
  owner: {
    key: "owner",
    dataProduct: "owner",
    label: "Owner Portal",
    badge: "Owner access",
    domain: "owner.arconique.com",
    wordmark: "Arconique",
    wordmarkSub: "Owner Portal",
    headline: ["Your villas, ", "in clear view."],
    sub: "Sign in to see statements, your calendar, and how the portfolio is performing.",
    testimonial: {
      quote: "I finally understand my returns without three emails and a spreadsheet.",
      who: "Villa owner · Uluwatu",
    },
    panelKicker: "Calm, quarterly clarity",
    accent: "var(--terra)",
    calm: true,
    links: { signup: false, mfa: false, bootstrap: false, sso: false },
  },
  development: {
    key: "development",
    dataProduct: "development",
    label: "Development OS",
    badge: "Staff workspace",
    domain: "development.arconique.com",
    wordmark: "Arconique",
    wordmarkSub: "Development OS",
    headline: ["Build ", "with control."],
    sub: "Sign in to manage projects, BOQs, procurement, cashflow and site reporting.",
    testimonial: {
      quote: "Every variation, RFI and rupiah of cost — traceable down to the line item.",
      who: "Project Director · Bukit 7",
    },
    panelKicker: "Engineering-grade",
    accent: "var(--amber)",
    links: { signup: false, mfa: true, bootstrap: false, sso: true },
  },
  investor: {
    key: "investor",
    dataProduct: "development",
    variant: "investor",
    label: "Investor Portal",
    badge: "Investor access",
    domain: "invest.arconique.com",
    wordmark: "Arconique",
    wordmarkSub: "Investor Portal",
    headline: ["Your capital, ", "transparent."],
    sub: "Sign in for distributions, capital calls, forecasts and project performance.",
    testimonial: {
      quote: "Quarterly clarity I used to chase for weeks now lives on a single screen.",
      who: "Limited Partner · Seminyak Fund I",
    },
    panelKicker: "Statement-grade reporting",
    accent: "var(--steel)",
    links: { signup: false, mfa: false, bootstrap: false, sso: false },
  },
  buyer: {
    key: "buyer",
    dataProduct: "development",
    variant: "buyer",
    label: "Buyer Portal",
    badge: "Buyer access",
    domain: "buyer.arconique.com",
    wordmark: "Arconique",
    wordmarkSub: "Buyer Portal",
    headline: ["Your home, ", "tracked."],
    sub: "Sign in to follow your unit's construction, payment ladder and documents.",
    testimonial: {
      quote: "I watched my villa rise from foundation to handover — photo by photo.",
      who: "Buyer · Canggu Residence 04",
    },
    panelKicker: "From foundation to keys",
    accent: "var(--amber)",
    links: { signup: false, mfa: false, bootstrap: false, sso: false },
  },
  platform: {
    key: "platform",
    dataProduct: "platform",
    label: "Platform Admin",
    badge: "Restricted",
    domain: "admin.arconique.com",
    wordmark: "Arconique",
    wordmarkSub: "Platform Admin OS",
    headline: ["System ", "control."],
    sub: "Operator access to organizations, AI agents, billing, usage and system health.",
    testimonial: null,
    panelKicker: "Operator console",
    accent: "var(--p-accent)",
    dark: true,
    links: { signup: false, mfa: true, bootstrap: false, sso: true },
  },
};

const AUTH_PLATFORM_ORDER = [
  "management", "owner", "development", "investor", "buyer", "platform",
];

// Right brand-panel tone — the "explore a few options" axis.
const AUTH_TONES = {
  warm: { key: "warm", label: "Warm" },
  premium: { key: "premium", label: "Premium dark" },
  editorial: { key: "editorial", label: "Editorial photo" },
};
const AUTH_TONE_ORDER = ["warm", "premium", "editorial"];

// Which supporting screens each platform can reach.
const AUTH_SCREENS = [
  { key: "signin", label: "Sign in" },
  { key: "signup", label: "Sign up" },
  { key: "forgot", label: "Forgot password" },
  { key: "reset", label: "Reset password" },
  { key: "mfa", label: "MFA verify" },
  { key: "bootstrap", label: "Admin bootstrap" },
];

Object.assign(window, {
  AUTH_PLATFORMS, AUTH_PLATFORM_ORDER,
  AUTH_TONES, AUTH_TONE_ORDER, AUTH_SCREENS,
});
