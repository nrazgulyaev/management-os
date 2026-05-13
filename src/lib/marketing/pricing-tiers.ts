/**
 * Sprint 3a — marketing pricing tiers (consolidated three-column model).
 *
 * Single source of truth for the new top-level `/pricing` page on
 * `subscription.arconique.com`. Three product columns
 * (Management only / Development only / Bundle), each with four tiers
 * (Starter / Pro / Scale / Enterprise) — per the operator's Sprint 3a
 * spec.
 *
 * COEXISTS with `src/lib/billing/pricing.ts`, which holds the older
 * Stage-10.I.4 per-product pricing (Starter / Professional /
 * Enterprise, different prices, no Bundle). Both modules are pure +
 * importable; the older one still drives `/pricing/management-os`
 * and `/pricing/development-os` until Sprint 3b reconciles them
 * alongside the Stripe wiring.
 *
 * Pure module — no I/O, no env, no DB. Prices are USD/month. AI
 * invocation overage rate is documented separately from per-tier
 * caps so the pricing page can render it once at the bottom.
 */

export type PlanKind = "management-only" | "development-only" | "bundle";

export type TierKey = "starter" | "pro" | "scale" | "enterprise";

export interface PricingTier {
  key: TierKey;
  /** Display name (e.g. "Starter"). */
  name: string;
  /**
   * Monthly USD price. `null` means "Talk to us" (Enterprise).
   * Annual pricing is the same number with a 15% discount applied
   * client-side via the `annualDiscountPct` shared on PlanColumn.
   */
  monthlyUsd: number | null;
  /** One-line positioning under the price. */
  pitch: string;
  /**
   * Per-tier limits. Render as a short stack of pill rows under the
   * price. `null` on Enterprise → "custom".
   */
  limits: {
    /** Villa cap (Mgmt + Bundle only). */
    villas?: number | "custom";
    /** Active-project cap (Dev + Bundle only). */
    projects?: number | "custom";
    /** Team seat cap. */
    users: number | "custom";
    /** AI invocations included per month. */
    aiCalls: number | "custom";
  };
  /** Feature bullets shown under the limits. */
  features: string[];
  /** Whether to render the "Recommended" highlight ring. */
  highlight?: boolean;
}

export interface PlanColumn {
  key: PlanKind;
  /** Human label ("Management only", "Bundle", …). */
  name: string;
  /** Short tagline under the column header. */
  tagline: string;
  /** Hero gradient class for the column header card. */
  toneClass:
    | "bg-gradient-emerald-soft"
    | "bg-gradient-gold-soft"
    | "bg-gradient-coral-soft";
  tiers: PricingTier[];
}

/**
 * Trial + commercial copy shared across the pricing page.
 */
export const PRICING_COPY = {
  trialDays: 14,
  trialBanner: "14-day free trial · No credit card · Cancel anytime",
  annualDiscountPct: 15,
  aiOverageNote: "AI overage billed at $0.05 / invocation",
  enterpriseCta: { label: "Talk to sales", href: "/contact" },
  defaultStartCta: { label: "Start free trial", href: "/signup" },
} as const;

// ============================================================================
// Tier definitions
// ============================================================================

const MGMT_TIERS: PricingTier[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyUsd: 79,
    pitch: "First-portfolio operators with a handful of villas.",
    limits: { villas: 5, users: 3, aiCalls: 100 },
    features: [
      "Bookings + 7 OTA channels",
      "Owner statements + audit trail",
      "Concierge AI (1 agent)",
      "Mobile field PWA",
      "Email support, 48h",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthlyUsd: 199,
    pitch: "Established operators running boutique portfolios.",
    limits: { villas: 25, users: 10, aiCalls: 500 },
    features: [
      "Everything in Starter",
      "All 9 AI agents",
      "Owner stays + equivalence groups",
      "Dynamic pricing engine",
      "API + webhooks",
      "Priority support, 12h",
    ],
    highlight: true,
  },
  {
    key: "scale",
    name: "Scale",
    monthlyUsd: 499,
    pitch: "Multi-property managers with portfolio-wide reporting needs.",
    limits: { villas: 100, users: 25, aiCalls: 2000 },
    features: [
      "Everything in Pro",
      "Multi-portfolio rollups",
      "Cabinet customisation per role",
      "Custom integrations (PMS / banking)",
      "Dedicated success manager",
      "Priority support, 4h",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthlyUsd: null,
    pitch: "Multi-region operators + 100+ villas.",
    limits: {
      villas: "custom",
      users: "custom",
      aiCalls: "custom",
    },
    features: [
      "Everything in Scale",
      "SLA-backed uptime",
      "Optional self-host / VPC isolation",
      "Procurement + legal review",
      "Annual review with leadership",
    ],
  },
];

const DEV_TIERS: PricingTier[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyUsd: 149,
    pitch: "Solo developer running a single active project.",
    limits: { projects: 1, users: 5, aiCalls: 200 },
    features: [
      "Project + BOQ + drawings",
      "Procurement (PR → PO)",
      "QA/QC + method statements",
      "Investor portal (1 project)",
      "Email support, 48h",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthlyUsd: 349,
    pitch: "Developer running a small portfolio of projects.",
    limits: { projects: 3, users: 15, aiCalls: 1000 },
    features: [
      "Everything in Starter",
      "Multi-project dashboards",
      "QS Cost Analyst + Risk Radar AI",
      "Capital ledger + waterfall distributions",
      "Sales pipeline + buyer portal",
      "Priority support, 12h",
    ],
    highlight: true,
  },
  {
    key: "scale",
    name: "Scale",
    monthlyUsd: 799,
    pitch: "Mid-market developer with concurrent projects.",
    limits: { projects: 10, users: 40, aiCalls: 3000 },
    features: [
      "Everything in Pro",
      "Cross-project resource pooling",
      "Document extraction at scale",
      "Custom integrations (ERP / banking)",
      "Dedicated success manager",
      "Priority support, 4h",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthlyUsd: null,
    pitch: "Multi-stakeholder developer + 10+ projects.",
    limits: {
      projects: "custom",
      users: "custom",
      aiCalls: "custom",
    },
    features: [
      "Everything in Scale",
      "SLA-backed uptime",
      "Optional self-host / VPC isolation",
      "Procurement + legal review",
      "Annual review with leadership",
    ],
  },
];

const BUNDLE_TIERS: PricingTier[] = [
  {
    key: "starter",
    name: "Starter",
    monthlyUsd: 199,
    pitch: "Run a few villas while developing your next one.",
    limits: { villas: 5, projects: 1, users: 8, aiCalls: 300 },
    features: [
      "Everything in Management Starter",
      "Everything in Development Starter",
      "Single sign-on across both workspaces",
      "Cross-product reporting",
      "Email support, 48h",
    ],
  },
  {
    key: "pro",
    name: "Pro",
    monthlyUsd: 499,
    pitch: "The standard for vertically integrated operators.",
    limits: { villas: 25, projects: 3, users: 25, aiCalls: 1500 },
    features: [
      "Everything in Management Pro",
      "Everything in Development Pro",
      "Single sign-on + shared org dashboards",
      "Cross-product audit trail",
      "Priority support, 12h",
    ],
    highlight: true,
  },
  {
    key: "scale",
    name: "Scale",
    monthlyUsd: 1199,
    pitch: "Portfolio operators developing the next generation in parallel.",
    limits: { villas: 100, projects: 10, users: 65, aiCalls: 5000 },
    features: [
      "Everything in Management Scale",
      "Everything in Development Scale",
      "Cross-cabinet customisation",
      "Custom integrations on both sides",
      "Dedicated success manager",
      "Priority support, 4h",
    ],
  },
  {
    key: "enterprise",
    name: "Enterprise",
    monthlyUsd: null,
    pitch: "Multi-region operators + developers under one roof.",
    limits: {
      villas: "custom",
      projects: "custom",
      users: "custom",
      aiCalls: "custom",
    },
    features: [
      "Everything in Bundle Scale",
      "SLA-backed uptime",
      "Optional self-host / VPC isolation",
      "Annual review with leadership",
    ],
  },
];

// ============================================================================
// Plan columns (exported)
// ============================================================================

export const PRICING_PLANS: PlanColumn[] = [
  {
    key: "management-only",
    name: "Management only",
    tagline: "Operate villas. Investor-grade by default.",
    toneClass: "bg-gradient-emerald-soft",
    tiers: MGMT_TIERS,
  },
  {
    key: "development-only",
    name: "Development only",
    tagline: "Build the next one. Reconciled.",
    toneClass: "bg-gradient-gold-soft",
    tiers: DEV_TIERS,
  },
  {
    key: "bundle",
    name: "Bundle",
    tagline: "Both products. One workspace.",
    toneClass: "bg-gradient-coral-soft",
    tiers: BUNDLE_TIERS,
  },
];

// ============================================================================
// FAQ (5–8 entries per spec)
// ============================================================================

export interface FaqEntry {
  q: string;
  a: string;
}

export const PRICING_FAQ: FaqEntry[] = [
  {
    q: "How does the 14-day free trial work?",
    a: "Sign up with email + password. No credit card. After 14 days the workspace becomes read-only unless you choose a plan; we never delete data without your action.",
  },
  {
    q: "What counts as an AI invocation?",
    a: "Every call our AI agents make to a model provider — Concierge AI replies, QS Cost Analyst runs, document extraction, etc. Overage above your plan's monthly cap is billed at $0.05 per invocation, monthly.",
  },
  {
    q: "Can I bring my own model API key?",
    a: "Yes. Per-org, per-agent API keys are supported (Anthropic, OpenAI, Gemini). Calls billed against your provider account don't count against the plan AI cap.",
  },
  {
    q: "Annual or monthly?",
    a: "Both. Annual saves 15%. Switch any time from billing settings.",
  },
  {
    q: "Can I change plans?",
    a: "Yes — upgrade is immediate (prorated), downgrade applies at the next renewal. Bundle ↔ standalone moves are supported.",
  },
  {
    q: "What if I outgrow Scale?",
    a: "Enterprise is custom — usually means dedicated infra, SLA-backed uptime, optional VPC isolation, and a quarterly review with our leadership.",
  },
  {
    q: "Do you offer non-profit / academic pricing?",
    a: "Case-by-case. Get in touch via Talk to sales and we'll work something out.",
  },
];
