import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { isSuperAdminContext } from "@/features/auth/require-super-admin";
import { ServiceTemporarilyUnavailable } from "@/components/system/service-temporarily-unavailable";
import { ImpersonationBanner } from "@/components/subscription-os/impersonation-banner";
import { PlatformShell } from "@/components/layout/platform-shell";

export const metadata: Metadata = {
  title: {
    default: "Arconique Platform Admin OS",
    template: "%s · Arconique Platform Admin OS",
  },
};

/**
 * Sprint 2 — Platform Admin OS layout (renamed from (subscription-app)
 * in Stage 10.6.E.1; URL prefix moved from /subscriptions to /platform
 * to free the `subscription` subdomain name for public sales).
 *
 * Permission model (SUPER-ADMIN-GATE-FIX):
 *   - super_admin role required, checked via `isSuperAdminContext()`
 *     which reads `user_roles` (canonical RBAC table) — NOT the
 *     `app_user_roles` cabinet table. See features/auth/require-super-admin.ts
 *     for the rationale on which table holds super_admin grants.
 *   - 10.6.E.2 may extend with a separate `customer_support` role; for
 *     v1 we gate purely on isSuperAdmin.
 *   - Layout pattern mirrors 10.6.B.2-fix: try/catch around the auth
 *     check + isRedirectError-aware re-throw + ServiceTemporarilyUnavailable
 *     fallback so a transient auth-path failure doesn't 500 the page
 *
 * Unlike Mgmt OS / Dev OS, Platform Admin OS is NOT product-gated by
 * the org's `productsEnabled` array — it's a platform-admin surface
 * that exists regardless of which products the org subscribes to. We
 * bypass `enforceProductAccess()` entirely and gate purely on
 * super_admin role.
 *
 * The body is wrapped in `PlatformShell`, which stamps
 * `data-product="platform"` + `data-surface="platform-os"` (the dark
 * operator-console palette — pixel-platform-console) so the platform-admin
 * pages resolve the dark DS chrome instead of falling through to bare
 * :root tokens, and mounts the console sidebar over the real /platform/*
 * routes. Pages still carry their own PageHeader.
 */
export default async function PlatformAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const { ok, ctx } = await isSuperAdminContext();

    // Demo mode (no DB) — let through; matches the demo-bypass pattern
    // used by enforceProductAccess in Stage 10.H.
    if (ctx.mode === "demo") {
      return (
        <PlatformShell>
          <main className="min-h-screen bg-canvas">
            <ImpersonationBanner />
            {children}
          </main>
        </PlatformShell>
      );
    }

    if (!ctx.appUser) {
      redirect("/login?next=/platform");
    }
    if (!ok) {
      redirect("/no-product-access?reason=platform-os-requires-super-admin");
    }

    return (
      <PlatformShell>
        <main className="min-h-screen bg-canvas">
          <ImpersonationBanner />
          {children}
        </main>
      </PlatformShell>
    );
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("[layout/platform] auth check threw:", err);
    return <ServiceTemporarilyUnavailable area="dev" />;
  }
}
