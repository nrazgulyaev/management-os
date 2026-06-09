import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell, AuthHead } from "@/components/auth/auth-shell";
import { AUTH_PLATFORMS, resolveTokenProduct } from "@/components/auth/auth-copy";
import { SignupForm } from "@/components/signup/signup-form";

export const metadata: Metadata = {
  title: "Get started free · Arconique",
  description:
    "Spin up an Arconique workspace in under a minute. 14-day free trial, no credit card required.",
};

export const dynamic = "force-dynamic";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ product?: string }>;
}) {
  const sp = await searchParams;
  const productParam = sp.product;
  const defaultProduct: "mgmt" | "dev" | "both" =
    productParam === "mgmt" || productParam === "dev" ? productParam : "both";

  // Public signup runs on the subscription identity (Mgmt + Dev together).
  const plat = AUTH_PLATFORMS.subscription;
  const tokenProduct = resolveTokenProduct(plat.dataProduct);

  return (
    <AuthShell
      dataProduct={tokenProduct}
      wordmarkSub={plat.wordmarkSub}
      tone={plat.tone}
      panelKicker={plat.panelKicker}
      testimonial={plat.testimonial}
      footer={
        <span>
          © {new Date().getFullYear()} Arconique · {plat.domain}
        </span>
      }
    >
      <AuthHead eyebrow="Start free · 14 days">
        Start your <em>trial.</em>
      </AuthHead>
      <p className="auth-sub">
        Create your organization. No credit card required — your workspace
        becomes read-only after the trial unless you choose a plan.
      </p>

      <SignupForm defaultProduct={defaultProduct} />

      <div className="auth-foot-row">
        <span>
          Already have an account?{" "}
          <Link href="/login" className="auth-link">
            Sign in
          </Link>
        </span>
      </div>
    </AuthShell>
  );
}
