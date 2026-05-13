/**
 * Sprint 3c — Soft toast surfaced when `enforceProductAccess` redirects
 * a user away from a product they no longer have access to.
 *
 * The Stage-7.D + Sprint-3c webhook bridge writes
 * `organizations.products_enabled` from
 * `subscription.metadata.products_enabled`. When the new value omits a
 * product (e.g. customer switched Bundle Pro → Mgmt-only Pro and Dev OS
 * is gone), the next attempt to land on the now-inaccessible product
 * causes `enforceProductAccess()` to `redirect()` to the first
 * remaining product's home with `?from=<lost>&reason=<…>` stamped on.
 *
 * This banner reads those query params (server-side) and renders a
 * dismissible inline message at the top of the destination shell so
 * the user gets a friendly explanation instead of silent teleportation.
 *
 * Server component — no state. Dismissal is the user navigating away
 * (params drop from the URL); we don't persist a "seen this" cookie.
 */

import { PRODUCT_LABELS, type ProductSlug } from "@/lib/products";

const REASON_COPY: Record<string, string> = {
  product_not_enabled:
    "isn't included in your current plan. Switch plans from your billing settings to restore access.",
  no_products_enabled:
    "isn't available because your subscription has no products attached. Pick a plan to restore access.",
  no_organization:
    "isn't reachable — your account isn't linked to an organization yet.",
};

export function ProductAccessChangedBanner({
  from,
  reason,
}: {
  from?: string;
  reason?: string;
}) {
  if (!from) return null;
  const slug = from as ProductSlug;
  const label = PRODUCT_LABELS[slug] ?? from;
  const body =
    REASON_COPY[reason ?? "product_not_enabled"] ??
    REASON_COPY.product_not_enabled;

  return (
    <div
      role="status"
      className="border-b border-line-soft bg-warning-weak/40 px-4 md:px-8 py-3 flex items-start gap-3 text-sm text-ink"
      data-stage10="product-access-changed-banner"
    >
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full bg-warning mt-2 shrink-0"
      />
      <p className="flex-1 leading-relaxed">
        <span className="font-medium">{label}</span> {body}{" "}
        <a
          href="/dashboard/billing/upgrade"
          className="underline underline-offset-2 hover:no-underline"
        >
          See plans
        </a>
        .
      </p>
    </div>
  );
}
