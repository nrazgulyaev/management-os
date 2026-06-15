import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { ShieldCheck } from "lucide-react";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import {
  resolveAuthPlatform,
  resolveTokenProduct,
} from "@/components/auth/auth-copy";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getMfaStatus } from "@/features/security-baseline/mfa-services";
import { StartEnrolmentButton } from "@/components/security/mfa-buttons";

export const metadata = { title: "Enrol MFA" };
export const dynamic = "force-dynamic";

export default async function MfaEnrolmentPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/setup/mfa");
  const status = await getMfaStatus(me.id);
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
      <AuthHead eyebrow="Setup · MFA">
        Set up two-factor <em>authentication.</em>
      </AuthHead>
      <p className="auth-sub">
        Adds a six-digit code from your authenticator app on top of your
        password. Strongly recommended for internal users.
      </p>

      {status.verified ? (
        <>
          <div className="auth-notice auth-notice-ok">
            <ShieldCheck className="auth-notice-ic w-4 h-4" strokeWidth={1.7} />
            <span>
              <strong>Already enrolled.</strong> Two-factor is already active on
              your account.
            </span>
          </div>
          <div className="auth-foot-row">
            <Link href="/dashboard/settings/security" className="auth-link">
              Open account security →
            </Link>
          </div>
        </>
      ) : status.pendingEnrolment ? (
        <>
          <p className="auth-sub">
            You started enrolment but did not finish verification. Continue
            below — or restart from scratch.
          </p>
          <div className="auth-foot-row">
            <Link href="/setup/mfa/verify" className="auth-link">
              Continue to verify →
            </Link>
          </div>
          <StartEnrolmentButton />
        </>
      ) : (
        <>
          <ol className="auth-sub list-decimal list-inside leading-relaxed space-y-2">
            <li>Click the button below to generate a TOTP secret.</li>
            <li>
              Scan the otpauth URL (or enter the secret manually) into Google
              Authenticator, 1Password, Authy, or your preferred authenticator
              app.
            </li>
            <li>
              Click <em>Continue to verify</em> and enter a 6-digit code.
            </li>
            <li>
              You will then see 10 recovery codes — store them somewhere safe.
              Each can be used exactly once if you lose your authenticator.
            </li>
          </ol>
          <StartEnrolmentButton />
        </>
      )}
    </AuthShell>
  );
}
