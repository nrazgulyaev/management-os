"use client";

import { RouteErrorBoundary } from "@/components/system/route-error-boundary";

/**
 * OBSERVABILITY-SPINE-H — route-group error boundary for the Development OS.
 * Catches render errors anywhere under /development-os/* and shows a recovery
 * UI instead of the framework white screen.
 */
export default function DevelopmentAppError(props: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <RouteErrorBoundary
      {...props}
      portalLabel="Development OS"
      homeHref="/development-os"
      homeLabel="Development OS home"
    />
  );
}
