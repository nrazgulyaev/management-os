import type { ReactNode } from "react";

import { MotionLayer } from "@/components/motion-layer";
import "./landing-responsive.css";

/**
 * HF-18 — Route group for the per-product marketing landings at
 * /products/management-os and /products/development-os.
 *
 * Why a separate route group (not nested under `(public)`):
 *
 * The parent `(public)/layout.tsx` mounts the global <PublicHeader> +
 * <PublicFooter>. Per-product landings render their own in-page
 * <MgmtNav> + <MgmtFooter> (or <DevNav> + <DevFooter>) — leaving both
 * mounted produces duplicate chrome.
 *
 * The original CHROME-CLEANUP-1 fix (commit a8120ec) used `usePathname()`
 * inside PublicHeader/PublicFooter to skip render on /products/* — but
 * middleware (ARCH-1 + HF-13) rewrites subdomain traffic
 * (management.arconique.com/ → /products/management-os internally).
 * `usePathname()` returns the URL the client sees ("/"), not the
 * internal route, so the conditional evaluated false and the global
 * chrome leaked through on subdomain landings.
 *
 * In App Router, sub-layouts WRAP the parent — they don't replace it —
 * so an empty `(public)/products/layout.tsx` wouldn't have helped.
 * The correct fix is a sibling route group: routes under
 * `(product-landings)/` inherit only THIS layout, not `(public)`'s.
 * Route groups in parens don't appear in the URL, so /products/* paths
 * still resolve normally, regardless of how the request arrived
 * (direct URL vs middleware-rewritten subdomain).
 */
export default function ProductLandingsLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <>
      {children}
      {/* Scroll-reveal / parallax / count-up engine — scoped to the product
          landing surfaces (moved out of the global root layout). */}
      <MotionLayer />
    </>
  );
}
