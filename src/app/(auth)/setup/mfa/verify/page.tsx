import { redirect } from "next/navigation";
import { headers } from "next/headers";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import { resolveAuthPlatform, resolveTokenProduct } from "@/components/auth/auth-copy";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { getMfaStatus } from "@/features/security-baseline/mfa-services";
import { MfaVerifyForm } from "@/components/security/mfa-verify-form";

export const metadata = { title: "Verify MFA" };
export const dynamic = "force-dynamic";

export default async function MfaVerifyPage() {
  const me = await getCurrentAppUser();
  if (!me) redirect("/login?next=/setup/mfa/verify");
  const status = await getMfaStatus(me.id);
  if (!status.pendingEnrolment) {
    if (status.verified) {
      redirect("/dashboard/settings/security");
    }
    redirect("/setup/mfa");
  }

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
      <Link href="/setup/mfa" className="auth-back">
        <ArrowLeft className="w-[15px] h-[15px]" strokeWidth={1.8} /> Back to setup
      </Link>
      <AuthHead eyebrow="Two-factor · Step 2">
        Enter your <em>code.</em>
      </AuthHead>
      <p className="auth-sub">
        Open your authenticator app and enter the current 6-digit code to
        finish enrolment.
      </p>

      <MfaVerifyForm mode="enrolment" />
    </AuthShell>
  );
}
