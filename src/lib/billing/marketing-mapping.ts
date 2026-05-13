/**
 * Sprint 3b — Marketing-tier → DB plan_code + products_enabled mapping.
 *
 * Single source of truth for the Sprint 3a marketing taxonomy. Each
 * customer-facing `(planKind, tierKey)` pair from
 * `src/lib/marketing/pricing-tiers.ts` resolves here to:
 *
 *   - `plan_code`         — the DB plan row that drives runtime gating
 *                           (cabinets, integrations, AI agents, limits)
 *   - `products_enabled`  — the subset of products (`mgmt`, `dev`)
 *                           that subscription unlocks for the org
 *   - `packaging_key`     — the stable identifier joining a Stripe
 *                           product (and its monthly+annual prices)
 *                           to this packaging
 *
 * Option C / hybrid model (operator decision 2026-05-13):
 *   - DB plan_codes stay as gating source of truth (Stage 7.B seed
 *     untouched: trial / basic / standard / pro / enterprise).
 *   - Marketing tiers (4 tiers × 3 plan kinds = 12 visible cells) map
 *     onto the DB plans via this mapping. Three packagings
 *     (mgmt-only / dev-only / bundle) share the same plan_code at a
 *     given tier — distinguished by `products_enabled`.
 *   - Stripe products are provisioned per *packaging*, not per
 *     plan_code, so a customer who buys "Bundle Pro" gets a single
 *     Stripe subscription with one combined price.
 *
 * Tier → plan_code spine (same across all three plan kinds):
 *
 *   starter      → basic
 *   pro          → standard
 *   scale        → pro
 *   enterprise   → enterprise
 *
 * Pure module — no I/O, no env, no DB. Importable from any server or
 * client surface. Tests use it to assert the mapping invariants.
 */

import type { ProductSlug } from "@/lib/products";
import type {
  PlanKind,
  TierKey,
} from "@/lib/marketing/pricing-tiers";

/** Stable id for the Stripe product that fulfils this packaging. */
export type PackagingKey =
  | "mgmt-only-starter"
  | "mgmt-only-pro"
  | "mgmt-only-scale"
  | "mgmt-only-enterprise"
  | "dev-only-starter"
  | "dev-only-pro"
  | "dev-only-scale"
  | "dev-only-enterprise"
  | "bundle-starter"
  | "bundle-pro"
  | "bundle-scale"
  | "bundle-enterprise";

/** DB plan_code values (must match drizzle/0085 seed). */
export type DbPlanCode =
  | "trial"
  | "basic"
  | "standard"
  | "pro"
  | "enterprise";

export interface MarketingMapping {
  packagingKey: PackagingKey;
  planKind: PlanKind;
  tierKey: TierKey;
  /** DB row that drives gating + AI quota + cabinet flags. */
  planCode: DbPlanCode;
  /** Products this packaging unlocks (`org.products_enabled`). */
  productsEnabled: ProductSlug[];
}

/**
 * Tier → plan_code spine. Shared across all three plan kinds so
 * gating stays consistent (a Mgmt-only Pro customer and a Bundle Pro
 * customer both run on `plan_code: standard` and therefore both get
 * Standard's cabinet/integration/AI-agent flags — they only differ
 * on `products_enabled`).
 */
const TIER_TO_PLAN_CODE: Record<TierKey, DbPlanCode> = {
  starter: "basic",
  pro: "standard",
  scale: "pro",
  enterprise: "enterprise",
};

const PRODUCTS_FOR_KIND: Record<PlanKind, ProductSlug[]> = {
  "management-only": ["mgmt"],
  "development-only": ["dev"],
  bundle: ["mgmt", "dev"],
};

/**
 * Build the deterministic packaging-key from (plan kind, tier).
 *
 *   ("management-only", "pro")  → "mgmt-only-pro"
 *   ("bundle",          "scale") → "bundle-scale"
 */
export function packagingKeyFor(
  planKind: PlanKind,
  tierKey: TierKey,
): PackagingKey {
  const kindShort =
    planKind === "management-only"
      ? "mgmt-only"
      : planKind === "development-only"
        ? "dev-only"
        : "bundle";
  return `${kindShort}-${tierKey}` as PackagingKey;
}

/**
 * Resolve a (planKind, tierKey) pair to its DB plan_code +
 * products_enabled + packaging_key.
 */
export function resolveMarketingMapping(
  planKind: PlanKind,
  tierKey: TierKey,
): MarketingMapping {
  return {
    packagingKey: packagingKeyFor(planKind, tierKey),
    planKind,
    tierKey,
    planCode: TIER_TO_PLAN_CODE[tierKey],
    productsEnabled: PRODUCTS_FOR_KIND[planKind],
  };
}

/**
 * Full 12-row mapping table. Useful for the Stripe-provisioning
 * script and the upgrade page renderer.
 */
export const ALL_MARKETING_MAPPINGS: MarketingMapping[] = (
  ["management-only", "development-only", "bundle"] as const
).flatMap((planKind) =>
  (["starter", "pro", "scale", "enterprise"] as const).map((tierKey) =>
    resolveMarketingMapping(planKind, tierKey),
  ),
);

/**
 * Reverse lookup — given a packaging key (e.g. from a Stripe webhook
 * `metadata.packaging_key`), find the originating planKind + tierKey
 * + DB plan_code + productsEnabled.
 */
export function mappingByPackagingKey(
  packagingKey: string,
): MarketingMapping | null {
  return (
    ALL_MARKETING_MAPPINGS.find((m) => m.packagingKey === packagingKey) ??
    null
  );
}

/**
 * Two billing cycles per packaging. Use the cycle to pick which
 * Stripe price ID applies (`stripe_monthly_price_id` /
 * `stripe_annual_price_id` on `plan_packaging`).
 */
export type BillingCycle = "monthly" | "annual";

/**
 * Apply the marketing-tier annual discount to a monthly price.
 *
 * 15% discount per operator decision; annual price is paid up-front.
 * Returns USD cents (BIGINT-safe — caller is responsible for
 * stringifying when posting to Stripe).
 */
export function annualPriceFromMonthly(monthlyUsd: number): number {
  return Math.round(monthlyUsd * 12 * 0.85);
}
