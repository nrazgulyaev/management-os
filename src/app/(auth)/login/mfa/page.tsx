import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import {
  resolveAuthPlatform,
  resolveTokenProduct,
} from "@/components/auth/auth-copy";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getMfaStatus } from "@/features/security-baseline/mfa-services";
import { hasValidMfaPendingMarker } from "@/features/security-baseline/mfa-pending-marker";
import { MfaChallengePanel } from "@/components/security/mfa-challenge-panel";

export const metadata = { title: "Two-factor verification" };
export const dynamic = "force-dynamic";

/**
 * MFA-ENFORCE-1 — login-time second-factor challenge.
 *
 * Reached when sign-in detected a verified MFA factor and stamped the
 * `mfa_pending` marker. Guards:
 *   - no session            → /login
 *   - no verified factor    → no challenge applies; clear nothing, send
 *                             the user to /dashboard (they're already
 *                             fully signed in; this page would otherwise
 *                             strand a no-factor user)
 *   - no valid marker       → already cleared / never set → /dashboard
 *
 * The marker check ensures a user who has finished (or never started) the
 * challenge can't get stuck on this page.
 */
export default async function LoginMfaPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/login/mfa");

  const status = await getMfaStatus(me.id);
  // No verified factor → there is no second factor to enforce. Never
  // strand the user here; the marker (if any) is irrelevant to them.
  if (!status.verified) redirect("/dashboard");

  // Marker absent/expired/cleared → challenge already satisfied or never
  // required for this session. Don't force a redundant challenge.
  const pending = await hasValidMfaPendingMarker(me.id);
  if (!pending) redirect("/dashboard");

  const h = await headers();
  const plat = resolveAuthPlatform(h.get("x-product"));
  const tokenProduct = resolveTokenProduct(plat.dataProduct);

  return (
    <AuthShell
      dataProduct={tokenProduct}
      wordmarkSub={plat.wordmarkSub}
      tone={plat.tone}
      panelKicker={plat.panelKicker}
      testimonial={plat.testimonial}
      stats={plat.stats}
      footer={
        <span>
          © {new Date().getFullYear()} Arconique · {plat.domain}
        </span>
      }
    >
      <AuthHead eyebrow="Two-factor · Verification">
        Confirm it's <em>you.</em>
      </AuthHead>
      <p className="auth-sub">
        Open your authenticator app and enter the current 6-digit code to
        finish signing in.
      </p>

      <MfaChallengePanel />
    </AuthShell>
  );
}
