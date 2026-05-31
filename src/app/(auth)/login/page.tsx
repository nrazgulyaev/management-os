import Link from "next/link";
import { headers } from "next/headers";
import { LoginForm } from "./form";

export const metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

/**
 * RESKIN-AUTH-1 — login screen ported from the Claude Design mockup
 * (design-handoff/auth · Auth Suite.html / auth-screens.jsx / auth-theme.jsx).
 *
 * The whole screen is wrapped in `data-product` so the per-product palette
 * AND display typeface (`--display-font` → Newsreader / Space Grotesk /
 * Fraunces) resolve — RootLayout only stamps data-product on the canonical
 * product hosts, so on preview/other hosts we default to "management" here,
 * which is what made the headline fall back to a broken serif before.
 *
 * Visual only — the form's fields, forgot-password, submit and signInAction
 * are unchanged (see ./form.tsx).
 */
interface AuthCopy {
  wordmarkSub: string;
  domain: string;
  badge: string;
  headPre: string;
  headEm: string;
  sub: string;
  panelKicker: string;
  quote: string;
  who: string;
  sso: boolean;
  signup: boolean;
}

const AUTH: Record<string, AuthCopy> = {
  management: {
    wordmarkSub: "Management OS",
    domain: "management.arconique.com",
    badge: "Staff workspace",
    headPre: "Welcome ",
    headEm: "back.",
    sub: "Sign in to run today's property — bookings, owners, front office and on-site teams.",
    panelKicker: "Designed for trust",
    quote:
      "The first villa-management platform that treats our owners like a family-office would.",
    who: "Director · Whitmore Villa Group",
    sso: true,
    signup: true,
  },
  development: {
    wordmarkSub: "Development OS",
    domain: "development.arconique.com",
    badge: "Staff workspace",
    headPre: "Build ",
    headEm: "with control.",
    sub: "Sign in to manage projects, BOQs, procurement, cashflow and site reporting.",
    panelKicker: "Engineering-grade",
    quote:
      "Every variation, RFI and rupiah of cost — traceable down to the line item.",
    who: "Project Director · Bukit 7",
    sso: true,
    signup: false,
  },
  subscription: {
    wordmarkSub: "Arconique",
    domain: "arconique.com",
    badge: "Get started",
    headPre: "Two systems, ",
    headEm: "one platform.",
    sub: "Sign in to your Arconique workspace — Management OS and Development OS, together.",
    panelKicker: "One operating company",
    quote:
      "Build it. Run it. Without switching browser tabs — or operating companies.",
    who: "Arconique",
    sso: false,
    signup: true,
  },
  platform: {
    wordmarkSub: "Platform Admin OS",
    domain: "admin.arconique.com",
    badge: "Restricted",
    headPre: "System ",
    headEm: "control.",
    sub: "Operator access to organizations, AI agents, billing, usage and system health.",
    panelKicker: "Operator console",
    quote: "",
    who: "",
    sso: true,
    signup: false,
  },
};

function BrandMark() {
  return (
    <svg width={26} height={26} viewBox="0 0 32 32" fill="none" aria-hidden>
      <path d="M16 4 L28 14 H24 L16 8 L8 14 H4 Z" fill="var(--terra)" />
      <path
        d="M16 13 L25 20 H21.5 L16 16 L10.5 20 H7 Z"
        fill="var(--terra)"
        opacity="0.62"
      />
      <path d="M16 21 L22 25.5 H10 Z" fill="var(--terra)" opacity="0.34" />
    </svg>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string; onboarded?: string }>;
}) {
  const { isSupabaseAuthConfigured } = await import("@/lib/env");
  const supabaseReady = isSupabaseAuthConfigured();
  const h = await headers();
  const product = h.get("x-product") ?? "";
  const copy = AUTH[product] ?? AUTH.management;
  // Token palette + display typeface only exist under one of the three
  // product scopes; default to management so the design resolves everywhere.
  const tokenProduct =
    product === "development" || product === "subscription"
      ? product
      : "management";
  const sp = await searchParams;
  const notice =
    sp.reset === "1"
      ? "Your password has been updated. Sign in with your new password."
      : sp.onboarded === "1"
        ? "Your workspace is ready. Sign in to get started."
        : null;

  return (
    <div
      data-product={tokenProduct}
      className="min-h-screen grid lg:grid-cols-2"
      style={{ background: "var(--cream, #f4efe6)" }}
    >
      {/* form column */}
      <div className="flex flex-col px-6 md:px-12 lg:px-16 py-8 lg:py-10">
        <div className="flex items-center gap-2.5">
          <BrandMark />
          <div className="leading-tight">
            <div className="display" style={{ fontSize: 18 }}>
              Arconique
            </div>
            <div className="label" style={{ fontSize: 9.5, marginTop: 1 }}>
              {copy.wordmarkSub}
            </div>
          </div>
        </div>

        <div className="flex-1 flex items-center">
          <div className="w-full max-w-[380px] mx-auto">
            <span className="label" style={{ color: "var(--terra)" }}>
              {copy.badge}
            </span>
            <h1
              className="display"
              style={{ fontSize: "clamp(40px, 5vw, 52px)", margin: "14px 0 0" }}
            >
              {copy.headPre}
              <em>{copy.headEm}</em>
            </h1>
            <p
              className="mt-3"
              style={{ fontSize: 15, color: "var(--ink-3)", maxWidth: 380 }}
            >
              {copy.sub}
            </p>

            {notice ? (
              <div className="mt-6 rounded-md border border-success/30 bg-success-weak/40 px-3 py-2 text-xs text-ink">
                {notice}
              </div>
            ) : null}

            <LoginForm
              supabaseReady={supabaseReady}
              product={product}
              sso={copy.sso}
            />

            <div
              className="mt-7 pt-6 text-[13.5px]"
              style={{ borderTop: "1px solid var(--line-soft)" }}
            >
              {copy.signup ? (
                <span className="text-ink-secondary">
                  New here?{" "}
                  <Link
                    href="/sign-up"
                    className="underline underline-offset-2 decoration-line-strong hover:text-ink"
                  >
                    Start a trial
                  </Link>
                </span>
              ) : (
                <span className="text-ink-tertiary">
                  Access is provisioned by your Arconique administrator.
                </span>
              )}
            </div>
          </div>
        </div>

        <p className="label" style={{ fontSize: 10, opacity: 0.75 }}>
          © {new Date().getFullYear()} Arconique · {copy.domain}
        </p>
      </div>

      {/* brand panel */}
      <div
        className="hidden lg:block relative"
        style={{
          borderLeft: "1px solid var(--line-soft)",
          background:
            "radial-gradient(ellipse at top right, color-mix(in oklab, var(--terra) 18%, transparent), transparent 58%), linear-gradient(180deg, var(--cream-warm, #faf7f1), var(--cream, #f4efe6))",
        }}
      >
        <div className="absolute inset-0 flex items-end p-12 lg:p-16">
          {copy.quote ? (
            <div className="max-w-md">
              <span className="label">{copy.panelKicker}</span>
              <p
                className="display"
                style={{ fontSize: 30, lineHeight: 1.22, margin: "18px 0 0" }}
              >
                “{copy.quote}”
              </p>
              <p style={{ marginTop: 18, fontSize: 13.5, color: "var(--ink-3)" }}>
                — {copy.who}
              </p>
            </div>
          ) : (
            <span className="label">{copy.panelKicker}</span>
          )}
        </div>
      </div>
    </div>
  );
}
