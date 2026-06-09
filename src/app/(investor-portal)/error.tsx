"use client";

import { RouteErrorBoundary } from "@/components/system/route-error-boundary";

/**
 * OBSERVABILITY-SPINE-H — route-group error boundary for the investor portal.
 * Catches render errors anywhere under /investor-portal/* and shows a recovery
 * UI instead of the framework white screen.
 */
export default function InvestorPortalError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      {...props}
      portalLabel="Investor Portal"
      homeHref="/investor-portal"
      homeLabel="Investor home"
    />
  );
}
