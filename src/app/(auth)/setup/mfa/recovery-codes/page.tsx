import Link from "next/link";
import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import {
  resolveAuthPlatform,
  resolveTokenProduct,
} from "@/components/auth/auth-copy";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getMfaStatus } from "@/features/security-baseline/mfa-services";

export const metadata = { title: "Recovery codes" };
export const dynamic = "force-dynamic";

export default async function MfaRecoveryCodesPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/setup/mfa/recovery-codes");
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
      <AuthHead eyebrow="Setup · MFA · recovery codes">
        Recovery <em>codes.</em>
      </AuthHead>
      <p className="auth-sub">
        If you lose access to your authenticator, you can use a recovery code to
        sign in once.
      </p>

      <p className="auth-sub">
        You have <strong>{status.activeRecoveryCodeCount}</strong> active
        recovery codes remaining. We never re-display the codes after enrolment
        — if you have lost yours, ask a super_admin / director to revoke your
        factor and re-enrol.
      </p>

      <div className="auth-foot-row">
        <Link href="/dashboard/settings/security" className="auth-link">
          Open account security →
        </Link>
      </div>
    </AuthShell>
  );
}
