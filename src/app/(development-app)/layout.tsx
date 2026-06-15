import type { Metadata } from "next";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { DevelopmentAppShell } from "@/components/development/development-app-shell";
import { ServiceWorkerRegister } from "@/components/development/pwa/service-worker-register";
import { enforceProductAccess } from "@/features/auth/products-access";
import { enforceMfaChallengeCleared } from "@/features/security-baseline/mfa-gate";
import { ServiceTemporarilyUnavailable } from "@/components/system/service-temporarily-unavailable";

export const metadata: Metadata = {
  title: {
    default: "Arconique Development OS",
    template: "%s · Arconique Development OS",
  },
};

// Stage 10.H — every /development-os/* request passes through the
// product-access guard. Same bypass + redirect rules as the Mgmt OS
// layout (super_admin / demo always pass; org without 'dev' gets
// redirected to its accessible product or /no-product-access).
//
// Stage 10.6.B.2-fix — wrapped the guard in try/catch with
// isRedirectError-aware re-throw. The 10.6.B.1 seed surfaced latent
// slow queries in the auth path; un-handled throws cascaded out of
// the layout into Vercel 500s, blocking every page handler from
// running. The fallback renders a minimal "Service temporarily
// unavailable" page WITHOUT the shell so a broken layout doesn't
// compound by re-trying the broken shell.
export default async function DevelopmentAppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  try {
    // MFA-ENFORCE-1 — a pending second-factor challenge takes priority
    // over every other gate. No-op for users without a verified factor.
    await enforceMfaChallengeCleared();
    await enforceProductAccess("dev");
  } catch (err) {
    if (isRedirectError(err)) throw err; // intentional redirect — preserve
    console.error("[layout/dev] enforceProductAccess threw:", err);
    return <ServiceTemporarilyUnavailable area="dev" />;
  }
  return (
    <>
      <ServiceWorkerRegister />
      <DevelopmentAppShell>{children}</DevelopmentAppShell>
    </>
  );
}
