"use client";

import { RouteErrorBoundary } from "@/components/system/route-error-boundary";

/**
 * OBSERVABILITY-SPINE-H — route-group error boundary for the buyer portal.
 * Catches render errors anywhere under /buyer-portal/* and shows a recovery
 * UI instead of the framework white screen.
 */
export default function BuyerPortalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      {...props}
      portalLabel="Buyer Portal"
      homeHref="/buyer-portal"
      homeLabel="Buyer home"
    />
  );
}
