import Link from "next/link";
import { Logo } from "@/components/brand/logo";
import { Badge } from "@/components/ui/badge";
import { ArrowUpRight } from "lucide-react";
import { isSupabaseAuthConfigured } from "@/lib/env";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };

export default function LoginPage() {
  const supabaseReady = isSupabaseAuthConfigured();

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-canvas">
      <div className="flex flex-col px-6 md:px-12 lg:px-16 py-10">
        <Logo />
        <div className="flex-1 flex items-center">
          <div className="max-w-sm w-full mx-auto">
            <span className="text-label">Arconique Management OS</span>
            <h1 className="text-display text-[44px] md:text-[56px] leading-[1.0] font-medium mt-4 text-ink tracking-tight">
              Welcome back.
            </h1>
            <p className="mt-3 text-ink-secondary">
              Sign in to your staff, owner, or investor workspace.
            </p>

            <LoginForm supabaseReady={supabaseReady} />

            <div className="mt-10 pt-6 border-t border-line-soft">
              <div className="flex items-center gap-2 mb-3">
                <span className="text-label">Demo access</span>
                <Badge tone="gold">Preview build</Badge>
              </div>
              <p className="text-sm text-ink-secondary mb-4">
                {supabaseReady
                  ? "Quick-jump into any surface to preview the product."
                  : "Authentication isn't fully wired. Jump straight into a surface to preview."}
              </p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { href: "/dashboard", label: "Admin dashboard" },
                  { href: "/owner", label: "Owner portal" },
                  { href: "/field", label: "Staff field" },
                  { href: "/stay/demo", label: "Guest stay" },
                ].map((l) => (
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
          © {new Date().getFullYear()} Arconique · management.arconique.com
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
