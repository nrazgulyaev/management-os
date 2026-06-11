import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Button } from "@/components/ui/button";

/**
 * Shared Forbidden state for auth-gated pages.
 *
 * Page-level guards (`requireInternalUser` / `requirePermission`) THROW an
 * AuthorizationError. The route-group layout redirects logged-OUT users, but
 * a logged-IN user who lacks the role/permission would otherwise crash the
 * route with a raw 500. Pages catch the throw and render this instead — an
 * honest "you don't have access" state, not a server error.
 *
 * Render it inside the page's own OS shell, e.g.:
 *   try { await requireInternalUser(); }
 *   catch (e) {
 *     if (e instanceof AuthorizationError)
 *       return <Shell><AccessForbidden backHref="/..." /></Shell>;
 *     throw e;
 *   }
 */
export function AccessForbidden({
  title = "Access required",
  description = "You don't have permission to view this page. Sign in with an account that has access, or head back.",
  backHref,
  backLabel = "Go back",
}: {
  title?: string;
  description?: string;
  backHref?: string;
  backLabel?: string;
}) {
  return (
    <EmptyState
      title={title}
      description={description}
      action={
        backHref ? (
          <Button asChild variant="secondary">
            <Link href={backHref}>{backLabel}</Link>
          </Button>
        ) : undefined
      }
    />
  );
}
