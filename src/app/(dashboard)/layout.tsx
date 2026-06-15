import { isRedirectError } from "next/dist/client/components/redirect-error";
import { DashboardShell } from "@/components/layout/dashboard-shell";
import { enforceProductAccess } from "@/features/auth/products-access";
import { enforceMfaChallengeCleared } from "@/features/security-baseline/mfa-gate";
import { ServiceTemporarilyUnavailable } from "@/components/system/service-temporarily-unavailable";

// Stage 10.H — every /dashboard/* request passes through the product-access
// guard. Demo mode + super_admin bypass; signed-in users with no `mgmt` in
// their org's products_enabled get redirected to their other product (or
// /no-product-access if zero). Anonymous visitors pass through to the
// existing sign-in CTA surfaces.
//
// Stage 10.6.B.2-fix — wrapped guard in try/catch with isRedirectError-
// aware re-throw. See (development-app)/layout.tsx for the full
// rationale; same pattern applied here for symmetry.
export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    // MFA-ENFORCE-1 — a pending second-factor challenge takes priority over
    // every other gate: bounce to /login/mfa before any product surface
    // resolves. No-op for users without a verified factor (no marker).
    await enforceMfaChallengeCleared();
    await enforceProductAccess("mgmt");
  } catch (err) {
    if (isRedirectError(err)) throw err; // intentional redirect — preserve
    console.error("[layout/dashboard] enforceProductAccess threw:", err);
    return <ServiceTemporarilyUnavailable area="mgmt" />;
  }
  return <DashboardShell>{children}</DashboardShell>;
}
