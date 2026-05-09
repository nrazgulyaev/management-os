import type { ProductSlug } from "@/lib/products";

/**
 * Stage 10.I.4 — Public-marketing pricing config.
 *
 * Source of truth for the per-product pricing pages
 * (/pricing/management-os, /pricing/development-os) and the closing
 * CTA copy on the signup flow (10.I.5). Pure module — no I/O, no env,
 * no DB. Importable from server components, client components, and
 * tests.
 *
 * Stripe + the live `subscription_plans` table get wired in Stage 10.L.
 * For now this hardcoded config drives the marketing surface; the
 * trial state machine (10.I.5) is independent of pricing values and
 * doesn't need any of this to enforce trial expiry.
 *
 * Values per operator decision (10.I.1):
 *   Mgmt OS:  $99 Starter (≤3 villas) / $299 Pro (≤15) / Enterprise
 *   Dev OS:   $199 Starter (1 project) / $499 Pro (≤5) / Enterprise
 *   Trial:    14 days, no credit card.
 */

export type PricingTierKey = "starter" | "professional" | "enterprise";

export interface PricingTier {
  key: PricingTierKey;
  /** Display name (e.g. "Starter"). */
  name: string;
  /** Single-sentence positioning ("Best for…"). */
  bestFor: string;
  /** Monthly USD price. `null` = contact sales. */
  monthlyUsd: number | null;
  /** Bullet list of features included at this tier. */
  features: string[];
  /** Hard cap shown beneath the price. */
  limit: string;
  /** True for the recommended/highlighted card. */
  highlight?: boolean;
  /** Primary CTA label + href. Enterprise uses Contact. */
  cta: { label: string; href: string };
}

export interface ProductPricing {
  product: ProductSlug;
  /** Display heading on the pricing page. */
  productLabel: string;
  /** Sub-headline copy. */
  tagline: string;
  /** Comparison-row matrix: each row's `value` map keyed by tier. */
  comparison: ComparisonRow[];
  faq: FaqEntry[];
  tiers: PricingTier[];
}

export interface ComparisonRow {
  feature: string;
  values: Record<PricingTierKey, string>;
}

export interface FaqEntry {
  question: string;
  answer: string;
}

const TRIAL_DAYS = 14;
const TRIAL_COPY = `${TRIAL_DAYS}-day free trial · No credit card`;

const MGMT_TIERS: PricingTier[] = [
  {
    key: "starter",
    name: "Starter",
    bestFor: "Hosts running their first 1–3 villas.",
    monthlyUsd: 99,
    limit: "Up to 3 villas",
    features: [
      "Bookings + 7 OTA channels",
      "Owner statements with audit trail",
      "Concierge AI (1 agent enabled)",
      "Maintenance + housekeeping workflows",
      "Mobile field PWA",
      "Email support, 48h SLA",
    ],
    cta: { label: "Start free trial", href: "/signup?product=mgmt&tier=starter" },
  },
  {
    key: "professional",
    name: "Professional",
    bestFor: "Operators managing 4–15 premium villas.",
    monthlyUsd: 299,
    limit: "Up to 15 villas",
    highlight: true,
    features: [
      "Everything in Starter",
      "All 9 AI agents",
      "Owner stays + equivalence groups",
      "Dynamic pricing engine",
      "Direct bookings + Stripe wiring",
      "API + webhooks (5 keys)",
      "Priority support, 12h SLA",
    ],
    cta: {
      label: "Start free trial",
      href: "/signup?product=mgmt&tier=professional",
    },
  },
  {
    key: "enterprise",
    name: "Enterprise",
    bestFor: "Multi-property managers + 16+ villas.",
    monthlyUsd: null,
    limit: "16+ villas",
    features: [
      "Everything in Professional",
      "Unlimited villas + AI invocations",
      "Custom integrations (PMS, banking, accounting)",
      "Dedicated success manager",
      "SLA-backed uptime",
      "Optional self-host / VPC isolation",
    ],
    cta: { label: "Talk to sales", href: "/contact?subject=mgmt-enterprise" },
  },
];

const DEV_TIERS: PricingTier[] = [
  {
    key: "starter",
    name: "Starter",
    bestFor: "Single active development project.",
    monthlyUsd: 199,
    limit: "1 active project",
    features: [
      "Project management + work packages",
      "BOQ + drawings registry",
      "Procurement (PR → quotation → PO)",
      "QA/QC + method statements",
      "Investor portal (1 project)",
      "Email support, 48h SLA",
    ],
    cta: { label: "Start free trial", href: "/signup?product=dev&tier=starter" },
  },
  {
    key: "professional",
    name: "Professional",
    bestFor: "Developers running 2–5 simultaneous projects.",
    monthlyUsd: 499,
    limit: "Up to 5 active projects",
    highlight: true,
    features: [
      "Everything in Starter",
      "Multi-project portfolio dashboards",
      "QS Cost Analyst + Risk Radar AI",
      "Capital ledger + waterfall distributions",
      "Sales pipeline + buyer portal",
      "Document extraction (invoices, contracts, statements)",
      "API + webhooks (10 keys)",
      "Priority support, 12h SLA",
    ],
    cta: {
      label: "Start free trial",
      href: "/signup?product=dev&tier=professional",
    },
  },
  {
    key: "enterprise",
    name: "Enterprise",
    bestFor: "Multi-stakeholder developers + 6+ projects.",
    monthlyUsd: null,
    limit: "6+ active projects",
    features: [
      "Everything in Professional",
      "Unlimited projects + AI invocations",
      "Custom integrations (ERP, banking, accounting)",
      "Cabinet customisation per role",
      "SLA-backed uptime + dedicated infra",
      "Optional self-host / VPC isolation",
    ],
    cta: { label: "Talk to sales", href: "/contact?subject=dev-enterprise" },
  },
];

const MGMT_COMPARISON: ComparisonRow[] = [
  {
    feature: "Villa cap",
    values: { starter: "3", professional: "15", enterprise: "Unlimited" },
  },
  {
    feature: "OTA channels",
    values: { starter: "7", professional: "7", enterprise: "7" },
  },
  {
    feature: "AI agents enabled",
    values: { starter: "1", professional: "9", enterprise: "9 + custom" },
  },
  {
    feature: "AI invocations / month",
    values: {
      starter: "100",
      professional: "1,000",
      enterprise: "Unlimited",
    },
  },
  {
    feature: "Owner statements",
    values: { starter: "✓", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "Owner portal",
    values: { starter: "✓", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "Dynamic pricing",
    values: { starter: "—", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "API + webhook keys",
    values: { starter: "1", professional: "5", enterprise: "Unlimited" },
  },
  {
    feature: "Custom integrations",
    values: { starter: "—", professional: "—", enterprise: "✓" },
  },
  {
    feature: "Support SLA",
    values: { starter: "48h", professional: "12h", enterprise: "Custom" },
  },
];

const DEV_COMPARISON: ComparisonRow[] = [
  {
    feature: "Active projects",
    values: { starter: "1", professional: "5", enterprise: "Unlimited" },
  },
  {
    feature: "BOQ + drawings",
    values: { starter: "✓", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "Procurement workflow",
    values: { starter: "✓", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "QS Cost Analyst AI",
    values: { starter: "—", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "Risk Radar AI",
    values: { starter: "—", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "Capital ledger + distributions",
    values: { starter: "✓", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "Document extraction",
    values: { starter: "—", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "Sales pipeline + buyer portal",
    values: { starter: "—", professional: "✓", enterprise: "✓" },
  },
  {
    feature: "API + webhook keys",
    values: { starter: "1", professional: "10", enterprise: "Unlimited" },
  },
  {
    feature: "Cabinet customisation",
    values: { starter: "—", professional: "—", enterprise: "✓" },
  },
  {
    feature: "Support SLA",
    values: { starter: "48h", professional: "12h", enterprise: "Custom" },
  },
];

const SHARED_FAQ: FaqEntry[] = [
  {
    question: "Do I need a credit card to start the trial?",
    answer:
      "No. The 14-day trial requires only an email address. We charge cards through the upgrade flow once you choose a plan — never automatically.",
  },
  {
    question: "What happens after the 14 days?",
    answer:
      "Your workspace becomes read-only — every record is preserved, you can't make new mutations until you choose a plan. Reach out to sales any time to extend or upgrade.",
  },
  {
    question: "Can I switch plans later?",
    answer:
      "Yes. Plan changes take effect at the next billing cycle. Upgrades are pro-rated; downgrades apply on renewal so you never lose pre-paid time.",
  },
  {
    question: "Is my data ever shared with other tenants?",
    answer:
      "No. Multi-tenant isolation is enforced at the database row level (Postgres RLS). Your org's records never leave your row set, even under operator error.",
  },
  {
    question: "Do you support self-hosting?",
    answer:
      "Self-host + VPC isolation are part of the Enterprise plan. Talk to sales for the technical fit assessment.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes. Cancel anytime from the billing dashboard. No retention calls, no clawback on data — you keep your data until you delete it.",
  },
  {
    question: "Are prices in USD or local currency?",
    answer:
      "All prices are quoted in USD. We invoice + accept payment in USD; multi-currency support (IDR, EUR) is on the roadmap for Enterprise customers.",
  },
];

export const MANAGEMENT_OS_PRICING: ProductPricing = {
  product: "mgmt",
  productLabel: "Management OS",
  tagline:
    "Operate every villa as an investment-grade asset. Pricing scales with your portfolio.",
  tiers: MGMT_TIERS,
  comparison: MGMT_COMPARISON,
  faq: SHARED_FAQ,
};

export const DEVELOPMENT_OS_PRICING: ProductPricing = {
  product: "dev",
  productLabel: "Development OS",
  tagline:
    "Build the next development with the same source of truth your investors will hold you to.",
  tiers: DEV_TIERS,
  comparison: DEV_COMPARISON,
  faq: SHARED_FAQ,
};

export const TRIAL_DURATION_DAYS = TRIAL_DAYS;
export const TRIAL_BANNER_COPY = TRIAL_COPY;

export function pricingFor(product: ProductSlug): ProductPricing {
  return product === "mgmt" ? MANAGEMENT_OS_PRICING : DEVELOPMENT_OS_PRICING;
}

export function formatTierPrice(tier: PricingTier): string {
  if (tier.monthlyUsd === null) return "Contact sales";
  return `$${tier.monthlyUsd.toLocaleString("en-US")}`;
}
