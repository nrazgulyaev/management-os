import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { ServiceTemporarilyUnavailable } from "@/components/system/service-temporarily-unavailable";
import { ImpersonationBanner } from "@/components/subscription-os/impersonation-banner";

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
 * Permission model unchanged from 10.6.E.1:
 *   - super_admin role required (10.6.E.2 may extend with a separate
 *     `customer_support` role; for v1 we gate on isSuperAdmin)
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
 * For v1 the body is just the page content (no shell yet — the
 * /platform landing page carries its own header).
 */
export default async function PlatformAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    const ctx = await getCurrentUserContext();

    // Demo mode (no DB) — let through; matches the demo-bypass pattern
    // used by enforceProductAccess in Stage 10.H.
    if (ctx.mode === "demo") {
      return (
        <main className="min-h-screen bg-canvas">
          <ImpersonationBanner />
          {children}
        </main>
      );
    }

    // Live mode — must be authenticated AND super_admin.
    if (!ctx.appUser) {
      redirect("/login?next=/platform");
    }
    if (!ctx.isSuperAdmin) {
      redirect("/no-product-access?reason=platform-os-requires-super-admin");
    }

    return (
      <main className="min-h-screen bg-canvas">
        <ImpersonationBanner />
        {children}
      </main>
    );
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("[layout/platform] auth check threw:", err);
    return <ServiceTemporarilyUnavailable area="dev" />;
  }
}
