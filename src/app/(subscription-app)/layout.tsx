import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { getCurrentUserContext } from "@/features/auth/permissions";
import { ServiceTemporarilyUnavailable } from "@/components/system/service-temporarily-unavailable";
import { ImpersonationBanner } from "@/components/subscription-os/impersonation-banner";

export const metadata: Metadata = {
  title: {
    default: "Arconique SubscriptionOS",
    template: "%s · Arconique SubscriptionOS",
  },
};

/**
 * Stage 10.6.E.1 — SubscriptionOS layout.
 *
 * Per CHECKPOINT 5 architecture defaults:
 *   - URL prefix: /subscriptions (not /platform-admin — operator-facing)
 *   - Permission: super_admin role required (10.6.E.2 may extend with
 *     a separate `customer_support` role; for v1 we gate on isSuperAdmin)
 *   - Layout pattern mirrors 10.6.B.2-fix: try/catch around the auth
 *     check + isRedirectError-aware re-throw + ServiceTemporarilyUnavailable
 *     fallback so a transient auth-path failure doesn't 500 the page
 *
 * Unlike Mgmt OS / Dev OS, SubscriptionOS is NOT product-gated by the
 * org's `productsEnabled` array — it's a platform-admin surface that
 * exists regardless of which products the org subscribes to. We bypass
 * `enforceProductAccess()` entirely and gate purely on super_admin role.
 *
 * For v1 the body is just the page content (no shell yet — the /subscriptions
 * landing page in 10.6.E.1.2 carries its own header). 10.6.E.2 introduces
 * <SubscriptionAppShell> with sidebar nav + topbar.
 */
export default async function SubscriptionAppLayout({
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
      redirect("/login?next=/subscriptions");
    }
    if (!ctx.isSuperAdmin) {
      redirect("/no-product-access?reason=subscription-os-requires-super-admin");
    }

    return (
      <main className="min-h-screen bg-canvas">
        <ImpersonationBanner />
        {children}
      </main>
    );
  } catch (err) {
    if (isRedirectError(err)) throw err;
    console.error("[layout/subscription] auth check threw:", err);
    return <ServiceTemporarilyUnavailable area="dev" />;
  }
}
