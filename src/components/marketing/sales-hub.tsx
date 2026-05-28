/**
 * Sprint 3a — Sales hub apex for `subscription.arconique.com/`.
 *
 * The operator's reference visual: emerald + gold product-chooser
 * cards, generous whitespace, Fraunces serif heads, infrastructure-
 * grade feature grid, "14 days. No credit card." closing CTA.
 *
 * Composition:
 *   1. Hero band       — "Run villas. Build the next one. One platform."
 *   2. Product chooser — two large cards (Mgmt sage / Dev gold) linking
 *                        into the existing /products/* detail pages
 *   3. Capabilities    — 6-card "Infrastructure-grade by default" grid
 *   4. Trial CTA band  — coral-soft gradient, 14-day-no-card pitch
 *
 * Uses existing Stage 10.6.C.1 tokens (no new tokens). Server
 * component — no client hooks.
 */

import Link from "next/link";
import { subscriptionUrl } from "@/lib/marketing/cross-product-links";
import {
  ArrowUpRight,
  Building2,
  Cpu,
  Globe2,
  HardHat,
  Layers,
  ShieldCheck,
  Smartphone,
  Sparkles,
} from "lucide-react";

interface ProductCardSpec {
  product: "management" | "development";
  eyebrow: string;
  title: string;
  tagline: string;
  features: string[];
  detailHref: string;
  toneClass: string;
}

const PRODUCTS: ProductCardSpec[] = [
  {
    product: "management",
    eyebrow: "Management OS",
    title: "Run the portfolio.",
    tagline:
      "Bookings, channels, owner statements, concierge, maintenance, dynamic pricing — for operators who answer to investors.",
    features: [
      "Bookings + 7 OTA channels",
      "Owner statements with audit trail",
      "Concierge AI + handoff",
      "Maintenance intelligence",
      "Dynamic pricing engine",
    ],
    detailHref: "/products/management-os",
    toneClass: "bg-gradient-emerald-soft",
  },
  {
    product: "development",
    eyebrow: "Development OS",
    title: "Build the next one.",
    tagline:
      "Project, BOQ, drawings, procurement, QA/QC, sales, investors, distributions. The operating layer for villa + condotel developments.",
    features: [
      "BOQ + drawings + revisions",
      "Procurement → quotation → PO",
      "QA/QC + method statements",
      "Capital ledger + waterfalls",
      "Sales pipeline + buyer portal",
    ],
    detailHref: "/products/development-os",
    toneClass: "bg-gradient-gold-soft",
  },
];

interface CapabilitySpec {
  icon: typeof Building2;
  title: string;
  body: string;
}

const CAPABILITIES: CapabilitySpec[] = [
  {
    icon: Layers,
    title: "Multi-tenant by construction",
    body: "Every row carries an org_id. RLS policies enforce isolation at the database, not the application — auditable by construction.",
  },
  {
    icon: ShieldCheck,
    title: "Role-based access",
    body: "Permission matrix + per-cabinet scope. AES-256-GCM credential storage. Audit log retains who-did-what-when across the entire surface.",
  },
  {
    icon: Sparkles,
    title: "AI agents integrated",
    body: "Per-org provider routing (Anthropic / OpenAI / Gemini) + per-agent prompts + BYO API keys. AI invocations metered + capped per plan.",
  },
  {
    icon: Cpu,
    title: "Real-time dashboards",
    body: "Server-side composition with the latest Next.js App Router, streaming where it helps. Cabinet-style dashboards for every role.",
  },
  {
    icon: Smartphone,
    title: "Mobile-first field app",
    body: "PWA with offline support. Housekeepers, maintenance staff, and field supervisors carry the same workspace as the office team.",
  },
  {
    icon: Globe2,
    title: "API + webhooks",
    body: "REST + webhook delivery for every domain event. Integrate with banking, accounting, channel managers, BMS, or your own data warehouse.",
  },
];

export function SalesHub() {
  return (
    <main
      className="min-h-screen bg-canvas"
      data-stage10="sales-hub"
      data-product="subscription"
    >
      {/* Hero band */}
      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-32 flex flex-col items-center text-center gap-8">
          <span className="text-[11px] uppercase tracking-[0.18em] text-ink-tertiary font-medium">
            Arconique OS
          </span>
          <h1 className="text-display text-[44px] md:text-[80px] leading-[1.02] font-medium text-ink tracking-tight max-w-4xl">
            Run villas.{" "}
            <em className="not-italic text-accent italic">Build the next one.</em>{" "}
            One platform.
          </h1>
          <p className="text-ink-secondary text-base md:text-xl leading-relaxed max-w-2xl">
            Two operating systems on one data core. Operate every villa as
            an investment-grade asset, develop every project with the same
            source of truth — investor-grade trust by default.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-2">
            <a
              href={subscriptionUrl("/signup")}
              className="inline-flex items-center gap-2 rounded-3xl bg-ink text-ink-inverse px-6 h-12 text-sm font-medium shadow-soft-card hover:bg-ink/90 transition-colors"
            >
              Start a 14-day free trial
              <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
            </a>
            <Link
              href="/contact"
              className="inline-flex items-center gap-2 rounded-3xl bg-surface text-ink border border-line-soft px-6 h-12 text-sm font-medium shadow-soft-card hover:bg-muted transition-colors"
            >
              Talk to sales
            </Link>
          </div>
          <p className="text-xs text-ink-tertiary">
            14 days. No credit card. Real data, real workflows.
          </p>
        </div>
      </section>

      {/* Product chooser */}
      <section className="border-b border-line-soft">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-28">
          <div className="max-w-2xl mb-12 md:mb-16">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Choose your product
            </span>
            <h2 className="mt-4 text-display text-[32px] md:text-[48px] leading-[1.05] font-medium text-ink tracking-tight">
              Operate, develop, or both.
            </h2>
            <p className="mt-5 text-ink-secondary text-base md:text-lg leading-relaxed">
              Each product ships as a standalone workspace. Add the second
              one when you're ready — the data model lines up.
            </p>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 md:gap-6">
            {PRODUCTS.map((p) => {
              const isMgmt = p.product === "management";
              return (
                <div
                  key={p.product}
                  className={`rounded-3xl border border-line-soft shadow-soft-card p-8 md:p-10 flex flex-col gap-6 ${p.toneClass}`}
                >
                  <div className="flex items-center gap-2.5">
                    <span
                      className={`w-9 h-9 rounded-full inline-flex items-center justify-center shrink-0 ${
                        isMgmt
                          ? "bg-accent text-accent-contrast"
                          : "bg-gold text-white"
                      }`}
                    >
                      {isMgmt ? (
                        <Building2 className="w-4 h-4" strokeWidth={1.75} />
                      ) : (
                        <HardHat className="w-4 h-4" strokeWidth={1.75} />
                      )}
                    </span>
                    <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                      {p.eyebrow}
                    </span>
                  </div>
                  <h3 className="text-display text-[32px] md:text-[44px] leading-[1.05] font-medium text-ink tracking-tight">
                    {p.title}
                  </h3>
                  <p className="text-sm md:text-base text-ink-secondary leading-relaxed">
                    {p.tagline}
                  </p>
                  <ul className="flex flex-col gap-2.5 text-sm text-ink mt-1">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2.5">
                        <span
                          className={`w-1.5 h-1.5 rounded-full mt-2 shrink-0 ${
                            isMgmt ? "bg-accent" : "bg-gold"
                          }`}
                        />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <div className="mt-auto pt-4 flex items-center gap-3">
                    <Link
                      href={p.detailHref}
                      className="inline-flex items-center gap-2 rounded-3xl bg-ink text-ink-inverse px-5 h-11 text-sm font-medium hover:bg-ink/90 transition-colors"
                    >
                      Explore {p.eyebrow.replace(" OS", "")}
                      <ArrowUpRight className="w-3.5 h-3.5" strokeWidth={1.75} />
                    </Link>
                    <Link
                      href={`/pricing#${p.product}`}
                      className="text-sm text-ink-secondary hover:text-ink underline-offset-4 hover:underline"
                    >
                      See pricing
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Capabilities */}
      <section className="border-b border-line-soft bg-muted/20">
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-28">
          <div className="max-w-2xl mb-12 md:mb-16">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Capabilities
            </span>
            <h2 className="mt-4 text-display text-[32px] md:text-[48px] leading-[1.05] font-medium text-ink tracking-tight">
              Infrastructure-grade by default.
            </h2>
            <p className="mt-5 text-ink-secondary text-base md:text-lg leading-relaxed">
              The things every operator needs but no one wants to pay for
              twice — multi-tenancy, audit, permissions, mobile, API, AI.
              Shipped, not optional.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-5">
            {CAPABILITIES.map((c) => {
              const Icon = c.icon;
              return (
                <div
                  key={c.title}
                  className="rounded-3xl border border-line-soft bg-surface shadow-soft-card p-6 md:p-7 flex flex-col gap-3"
                >
                  <Icon
                    className="w-5 h-5 text-ink-tertiary"
                    strokeWidth={1.75}
                  />
                  <h3 className="text-ink font-medium text-base md:text-lg leading-tight">
                    {c.title}
                  </h3>
                  <p className="text-sm text-ink-secondary leading-relaxed">
                    {c.body}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Trial CTA band */}
      <section>
        <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-20 md:py-28">
          <div className="rounded-3xl border border-line-soft bg-gradient-coral-soft shadow-elevated-card p-10 md:p-16 flex flex-col md:flex-row md:items-center md:justify-between gap-8">
            <div className="max-w-xl">
              <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
                Start free
              </span>
              <h2 className="mt-3 text-display text-[28px] md:text-[44px] leading-[1.08] font-medium text-ink tracking-tight">
                14 days. No credit card. Real data, real workflows.
              </h2>
              <p className="mt-4 text-sm md:text-base text-ink-secondary leading-relaxed">
                Provision a workspace, connect a villa or scaffold a
                project, walk the audit trail with us.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 shrink-0">
              <a
                href={subscriptionUrl("/signup")}
                className="inline-flex items-center gap-2 rounded-3xl bg-ink text-ink-inverse px-6 h-12 text-sm font-medium shadow-soft-card hover:bg-ink/90 transition-colors"
              >
                Start free trial
                <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
              </a>
              <Link
                href="/pricing"
                className="inline-flex items-center gap-2 rounded-3xl bg-surface text-ink border border-line-soft px-6 h-12 text-sm font-medium hover:bg-muted transition-colors"
              >
                See pricing
              </Link>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
