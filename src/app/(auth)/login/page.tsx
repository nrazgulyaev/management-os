import Link from "next/link";
import { headers } from "next/headers";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight } from "lucide-react";
import { isSupabaseAuthConfigured } from "@/lib/env";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

interface ProductCopy {
  workspaceLabel: string;
  quickLinks: { href: string; label: string }[];
}

const PRODUCT_COPY: Record<string, ProductCopy> = {
  management: {
    workspaceLabel: "Arconique Management OS",
    quickLinks: [
      { href: "/dashboard", label: "Admin dashboard" },
      { href: "/owner", label: "Owner portal" },
      { href: "/field", label: "Staff field" },
      { href: "/stay/demo", label: "Guest stay" },
    ],
  },
  development: {
    workspaceLabel: "Arconique Development OS",
    quickLinks: [
      { href: "/development-os", label: "Development OS" },
      { href: "/investor-portal/login", label: "Investor portal" },
      { href: "/buyer-portal/login", label: "Buyer portal" },
      { href: "/vendor", label: "Vendor portal" },
    ],
  },
  platform: {
    workspaceLabel: "Arconique Platform Admin OS",
    quickLinks: [{ href: "/platform", label: "Platform admin" }],
  },
  subscription: {
    workspaceLabel: "Arconique",
    quickLinks: [
      { href: "/pricing", label: "View pricing" },
      { href: "/signup", label: "Sign up" },
      { href: "/contact", label: "Contact sales" },
    ],
  },
};

const DEFAULT_COPY: ProductCopy = {
  workspaceLabel: "Arconique Management OS",
  quickLinks: [
    { href: "/dashboard", label: "Admin dashboard" },
    { href: "/owner", label: "Owner portal" },
    { href: "/field", label: "Staff field" },
    { href: "/stay/demo", label: "Guest stay" },
  ],
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; onboarded?: string }>;
}) {
  const supabaseReady = isSupabaseAuthConfigured();
  const h = await headers();
  const product = h.get("x-product") ?? "";
  const copy = PRODUCT_COPY[product] ?? DEFAULT_COPY;
  const sp = await searchParams;
  const notice =
    sp.reset === "1"
      ? "Your password has been updated. Sign in with your new password."
      : sp.onboarded === "1"
        ? "Your workspace is ready. Sign in to get started."
        : null;

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-canvas">
      <div className="flex flex-col px-6 md:px-12 lg:px-16 py-10">
        <Logo />
        <div className="flex-1 flex items-center">
          <div className="max-w-sm w-full mx-auto">
            <span className="text-label">{copy.workspaceLabel}</span>
            <h1 className="text-display text-[44px] md:text-[56px] leading-[1.0] font-medium mt-4 text-ink tracking-tight">
              Welcome back.
            </h1>
            <p className="mt-3 text-ink-secondary">
              Sign in to your staff, owner, or investor workspace.
            </p>

            {notice ? (
              <div className="mt-6 rounded-sm border border-success/30 bg-success-weak/40 px-3 py-2 text-xs text-ink">
                {notice}
              </div>
            ) : null}

            <LoginForm supabaseReady={supabaseReady} product={product} />

            <div className="mt-10 pt-6 border-t border-line-soft">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-label">
                  {product === "subscription" ? "Explore" : "Demo access"}
                </span>
                <Badge tone="gold">Preview build</Badge>
              </div>
              <p className="text-sm text-ink-secondary mb-4">
                {supabaseReady
                  ? "Quick-jump into any surface to preview the product."
                  : "Authentication isn't fully wired. Jump straight into a surface to preview."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {copy.quickLinks.map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="flex items-center justify-between rounded-2xl border border-line-soft bg-surface hover:bg-muted hover:shadow-soft-card px-4 h-12 text-sm text-ink transition-all"
                  >
                    {l.label}
                    <ArrowUpRight
                      className="w-3.5 h-3.5 text-ink-tertiary"
                      strokeWidth={1.75}
                    />
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
        <p className="text-xs text-ink-tertiary">
          © {new Date().getFullYear()} Arconique ·{" "}
          {product
            ? `${product}.arconique.com`
            : "management.arconique.com"}
        </p>
      </div>
      <div
        className="hidden lg:block relative border-l border-line-soft"
        style={{
          background:
            "radial-gradient(ellipse at top right, var(--accent-weak), transparent 60%), linear-gradient(180deg, var(--muted), var(--canvas))",
        }}
      >
        <div className="absolute inset-0 flex items-end p-12">
          <div className="max-w-md">
            <span className="text-label">Designed for trust</span>
            <p className="text-display text-[28px] md:text-[32px] leading-[1.15] font-medium text-ink mt-4">
              "The first villa-management platform that treats our owners like a
              family-office would."
            </p>
            <p className="mt-4 text-sm text-ink-secondary">— Director, Arconique</p>
          </div>
        </div>
      </div>
    </div>
  );
}
