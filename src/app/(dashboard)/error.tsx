"use client";

import { RouteErrorBoundary } from "@/components/system/route-error-boundary";

/**
 * OBSERVABILITY-SPINE-H — route-group error boundary for the management
 * dashboard. Catches render errors anywhere under /dashboard/* and shows a
 * recovery UI instead of the framework white screen.
 */
export default function DashboardError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      {...props}
      portalLabel="Management OS"
      homeHref="/dashboard"
      homeLabel="Management OS home"
    />
  );
}
