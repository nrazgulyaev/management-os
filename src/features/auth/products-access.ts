import "server-only";

import { cache } from "react";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { getDb } from "@/lib/db/client";
import { organizations } from "@/lib/db/schema/saas";
import {
  coerceProductSlugs,
  PRODUCT_HOME,
  type ProductSlug,
} from "@/lib/products";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { getCurrentAppUser } from "@/features/auth/current-user";
import {
  decideProductAccess,
  landingPathFor,
  type ProductAccessOutcome,
} from "./products-access-pure";

// Re-export the pure helpers so call sites have a single import path.
export { decideProductAccess, landingPathFor };
export type { ProductAccessOutcome };

/**
 * Stage 10.H — Per-product access read + enforcement.
 *
 * `getProductsEnabledForCurrentUser()` resolves the current user's
 * organization → `products_enabled text[]`. Returns null when no
 * signed-in user / no DB.
 *
 * `enforceProductAccess(product)` is the layout-level guard. It calls
 * the helper, applies the super_admin / internal / demo bypass rules,
 * and `redirect()`s when the org doesn't have access. Used by both
 * Mgmt OS + Dev OS layouts.
 *
 * Why a layout guard instead of edge middleware: the Edge runtime
 * can't easily query Postgres, and middleware-level redirects can't
 * surface a friendly inline message without a separate page. The
 * layout sits server-side per request and already has DB access.
 */

/**
 * Stage 10.6.B.2-fix — wrapped in React's `cache()` so the layout +
 * any subsequent server-component caller share ONE DB roundtrip
 * within a single request. Combined with the `cache()` wrap on
 * getCurrentUserContext, the layout-level enforceProductAccess call
 * goes from 5 DB queries down to 2 (auth + roles join + organizations
 * lookup, deduped per request).
 */
export const getProductsEnabledForCurrentUser = cache(
  async function getProductsEnabledForCurrentUser(): Promise<
    ProductSlug[] | null
  > {
    const me = await getCurrentAppUser();
    if (!me) return null;
    const db = getDb();
    if (!db) return null;

    // PERF: getCurrentAppUser() already returns organizationId (NOT NULL in
    // v0071+), so the previous re-SELECT of appUsers.organizationId here was a
    // redundant DB round-trip on every layout render. Use me.organizationId
    // directly — one query instead of two.
    if (!me.organizationId) return null;

    const [org] = await db
      .select({ productsEnabled: organizations.productsEnabled })
      .from(organizations)
      .where(eq(organizations.id, me.organizationId))
      .limit(1);

    return coerceProductSlugs(org?.productsEnabled);
  },
);

/**
 * Whether to show the Mgmt ↔ Dev product switcher in the shell topbar.
 *
 * The switcher only makes sense — and should only appear — when BOTH of the
 * following hold:
 *   1. the user's organization has BOTH products enabled (mgmt + dev), and
 *   2. the user is the main administrator (super_admin).
 *
 * A single-product org (mgmt-only or dev-only) has nowhere to switch to, and a
 * non-admin in a dual-product org shouldn't be hopping between platforms — so in
 * every other case the switcher is hidden. Reuses the cache()'d context +
 * products reads, so it adds no extra DB round-trip per request.
 */
export async function canUseAppSwitcher(): Promise<boolean> {
  const ctx = await getCurrentUserContext();
  if (!ctx.appUser || !ctx.isSuperAdmin) return false;
  const productsEnabled = await getProductsEnabledForCurrentUser();
  if (!productsEnabled) return false;
  return productsEnabled.includes("mgmt") && productsEnabled.includes("dev");
}

/**
 * Layout-level enforcement. Call from Mgmt OS / Dev OS root layouts.
 * - Demo mode + super_admin / audit-bot: always allowed (no redirect).
 * - No signed-in user: pass through (the existing auth-guard surfaces
 *   render the sign-in CTA / dashboard skeleton).
 * - Org has access: pass through.
 * - Org has access to a different product: 308 redirect to that
 *   product's home.
 * - Org has zero products: redirect to /no-product-access.
 */
export async function enforceProductAccess(product: ProductSlug): Promise<void> {
  const ctx = await getCurrentUserContext();

  // Pass-through when there's no signed-in user — the existing
  // dashboard / dev-os layouts surface the sign-in CTA themselves;
  // we don't want to short-circuit that with a redirect from the guard.
  if (!ctx.appUser) return;

  const productsEnabled = await getProductsEnabledForCurrentUser();
  const decision = decideProductAccess({
    product,
    productsEnabled,
    isSuperAdmin: ctx.isSuperAdmin,
    isDemoMode: ctx.mode === "demo",
  });

  if (decision.allowed) return;

  // Sprint 3c — stamp `?from=<product>&reason=…` so the destination
  // layout can surface a "you lost access to X" banner (e.g. Bundle
  // → Mgmt-only customer who just got bumped off /development-os).
  // Stage 10.H's existing redirect target picks the first alternative
  // product the org still has access to; we just enrich the URL.
  if (decision.alternativeProducts.length > 0) {
    const alt = decision.alternativeProducts[0];
    redirect(
      `${PRODUCT_HOME[alt]}?from=${product}&reason=${decision.reason ?? "product_not_enabled"}`,
    );
  }
  redirect(`/no-product-access?from=${product}`);
}

