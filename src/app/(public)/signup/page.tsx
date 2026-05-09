import type { Metadata } from "next";
import Link from "next/link";
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

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-lg">
        <div className="text-center mb-8">
          <span className="text-label">Get started</span>
          <h1 className="mt-3 font-display text-3xl md:text-4xl tracking-[-0.02em] text-ink leading-[1.1]">
            14-day free trial.
          </h1>
          <p className="mt-3 text-sm text-ink-secondary leading-relaxed">
            No credit card. Real workflows, real data. Cancel anytime — your
            workspace becomes read-only after the trial unless you choose a
            plan.
          </p>
        </div>

        <div className="rounded-md border border-line-soft bg-surface p-6 md:p-8">
          <SignupForm defaultProduct={defaultProduct} />
        </div>

        <p className="mt-6 text-center text-xs text-ink-tertiary">
          Already have an account?{" "}
          <Link href="/login" className="text-ink hover:underline">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
