import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { FieldShell } from "@/components/layout/field-shell";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { enforceProductAccess } from "@/features/auth/products-access";
import { ServiceTemporarilyUnavailable } from "@/components/system/service-temporarily-unavailable";

/**
 * P0 security — server-side gate for the field PWA (/field/*).
 *
 * Before this gate the field surface had NO auth check: any anonymous
 * visitor could load /field/tasks/[id], whose loader (getOperationTaskById)
 * is unscoped and returned ANY task by id. The field PWA is an internal
 * staff tool, so it must require a signed-in user in live mode.
 *
 * Gating:
 *   1. Demo / no-DB mode → pass through (the platform is browsable
 *      without auth when Supabase/DB are unconfigured).
 *   2. Live mode, not signed in → /login?next=/field.
 *   3. Live mode, signed in → enforceProductAccess("mgmt") (field staff
 *      live under the Management OS product, same as /dashboard).
 *
 * Hardening mirrors (dashboard)/layout.tsx: the guard runs inside
 * try/catch; intentional redirect signals are re-thrown, and any
 * unexpected runtime error degrades to the "service unavailable" page
 * rather than leaking a stack or rendering a broken shell.
 */

export const dynamic = "force-dynamic";

export default async function FieldLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const ctx = await getCurrentUserContext();
    // Demo / unconfigured-DB mode stays open so the platform is browsable.
    if (ctx.mode !== "demo") {
      if (!ctx.appUser) {
        redirect("/login?next=/field");
      }
      await enforceProductAccess("mgmt");
    }
  } catch (err) {
    if (isRedirectError(err)) throw err; // intentional redirect — preserve
    console.error("[layout/field] auth gate threw:", err);
    return <ServiceTemporarilyUnavailable area="mgmt" />;
  }
  return <FieldShell>{children}</FieldShell>;
}
