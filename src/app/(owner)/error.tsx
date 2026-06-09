"use client";

import { RouteErrorBoundary } from "@/components/system/route-error-boundary";

/**
 * OBSERVABILITY-SPINE-H — route-group error boundary for the owner portal.
 * Catches render errors anywhere under /owner/* and shows a recovery UI
 * instead of the framework white screen.
 */
export default function OwnerError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      {...props}
      portalLabel="Owner Portal"
      homeHref="/owner"
      homeLabel="Owner home"
    />
  );
}
