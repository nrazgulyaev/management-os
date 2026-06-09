/**
 * Stage 10.6.E.1 — SubscriptionOS landing page (placeholder).
 *
 * The architecture phase ships this minimal landing so the workspace
 * switcher has somewhere to land + super_admin gating is exercised
 * end-to-end. The 6 admin pages (organizations, per-org detail,
 * revenue, usage, support tools, audit) ship in 10.6.E.2.
 *
 * Carries its own header per 10.6.C tokens since the layout doesn't
 * mount a shell yet.
 */

import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowUpRight,
  Bot,
  Building2,
  CreditCard,
  Flag,
  LineChart,
  LifeBuoy,
  ScrollText,
  Layers,
} from "lucide-react";
import {
  CabinetGreetingBlock,
  PageHeaderHero,
  IntegrationStatusCard,
  type IntegrationStatusCardProps,
} from "@/components/ui/primitives";
import { getCurrentAppUser } from "@/features/auth/current-user";

export const metadata: Metadata = {
  title: "Platform Admin OS",
};
export const dynamic = "force-dynamic";

interface PageCard {
  name: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  status: IntegrationStatusCardProps["status"];
  detail: string;
}

const PLANNED_PAGES: PageCard[] = [
  {
    name: "Customer organizations",
    description:
      "All customer orgs at a glance. Filter by status (trial / paid / cancelled), search by name/email, drill into any org for subscription state + actions.",
    icon: <Building2 className="w-5 h-5" />,
    href: "/platform/organizations",
    status: "needs-config",
    detail: "Ships in 10.6.E.2.1",
  },
  {
    name: "Revenue dashboard",
    description:
      "MRR, ARR, customer count by tier, trial → paid conversion rate, churn rate. Read from existing orgSubscriptions + subscriptionPlans tables.",
    icon: <LineChart className="w-5 h-5" />,
    href: "/platform/revenue",
    status: "needs-config",
    detail: "Ships in 10.6.E.2.3",
  },
  {
    name: "Usage analytics",
    description:
      "Per-org AI token consumption, storage usage, active users, cost estimates. Read from usageMetrics table.",
    icon: <LineChart className="w-5 h-5" />,
    href: "/platform/usage",
    status: "needs-config",
    detail: "Ships in 10.6.E.2.4",
  },
  {
    name: "Customer support tools",
    description:
      "View as customer (read-only impersonation), audit trail per customer org, common issue templates. Tickets stay external (Plain / Linear / Intercom) per CHECKPOINT 5 default.",
    icon: <LifeBuoy className="w-5 h-5" />,
    href: "/platform/support",
    status: "needs-config",
    detail: "Ships in 10.6.E.2.5",
  },
  {
    name: "Platform-admin audit log",
    description:
      "Every platform-admin action logged: who, when, what, before/after. Searchable + exportable. Read-only.",
    icon: <ScrollText className="w-5 h-5" />,
    href: "/platform/audit",
    status: "needs-config",
    detail: "Ships in 10.6.E.2.6",
  },
  {
    name: "Stripe billing collection",
    description:
      "Per-org subscription management via Stripe Customer Portal. Required wiring lives in 10.6.D.2.2 — this page surfaces the per-org portal links once that ships.",
    icon: <CreditCard className="w-5 h-5" />,
    href: "/platform/billing",
    status: "needs-config",
    detail: "Ships after 10.6.D.2.2 (Stripe Connect) lands",
  },
  {
    name: "AI agents",
    description:
      "Platform-managed AI agents. Define provider/model/system prompt/budget centrally, upload a knowledge base per agent, then subscribe customer orgs to enabled agents.",
    icon: <Bot className="w-5 h-5" />,
    href: "/platform/agents",
    status: "needs-config",
    detail: "P5 AGENT-FOUNDATION — schema + Vault shipped, admin UI in progress",
  },
  {
    name: "Feature flags",
    description:
      "Every flag in the catalog with its owner, lifecycle stage (GA / beta / internal / archived), and rollout %. Kill a flag to disable it everywhere, bump rollout to widen exposure, or register a new flag. Every change is audit-logged.",
    icon: <Flag className="w-5 h-5" />,
    href: "/platform/feature-flags",
    status: "configured",
    detail: "Live — index + kill switch + rollout + new-flag form",
  },
];

export default async function SubscriptionsLandingPage() {
  const me = await getCurrentAppUser();
  const firstName = me?.fullName?.trim().split(/\s+/)[0] ?? null;

  return (
    <div className="max-w-[1400px] mx-auto px-6 md:px-8 py-10 flex flex-col gap-10">
      <CabinetGreetingBlock
        firstName={firstName}
        eyebrow="Platform Admin OS"
        subline="Manage customer organizations, billing, and platform-admin tooling. v1 architecture phase shipped — admin pages land in 10.6.E.2."
      />

      <PageHeaderHero
        eyebrow="Welcome to Platform Admin OS"
        title="Run the business of the platform."
        description="Customer org overview, subscription state, revenue rollups, customer support, and platform-admin audit log — gated to super_admin and separate from per-tenant Mgmt OS / Dev OS."
        actions={
          <Link
            href="/dashboard/settings/integrations"
            className="inline-flex items-center gap-1 text-sm font-medium text-ink hover:text-accent transition-colors"
          >
            Integrations command center
            <ArrowUpRight className="w-4 h-4" strokeWidth={1.75} />
          </Link>
        }
      />

      <section className="rounded-3xl border border-line-soft bg-gradient-emerald-soft shadow-soft-card p-7 md:p-8">
        <div className="flex items-start gap-4">
          <span className="w-12 h-12 rounded-2xl bg-ink text-ink-inverse flex items-center justify-center shrink-0">
            <Layers className="w-6 h-6" strokeWidth={1.75} />
          </span>
          <div className="flex flex-col gap-2 min-w-0">
            <h2 className="text-display text-[24px] md:text-[28px] leading-tight font-medium text-ink">
              Foundation already in place
            </h2>
            <p className="text-sm md:text-base text-ink-secondary leading-relaxed max-w-3xl">
              The Platform Admin OS schema (orgSubscriptions FSM, subscriptionPlans,
              featureFlags, planFeatures, lifecycle audit) shipped in Stage 7.D.
              Stripe webhooks + trial-status cron + workspace switcher all
              exist. 10.6.E is the operator-facing layer on top — no new
              backend or migrations required for the v1 MVP.
            </p>
          </div>
        </div>
      </section>

      <div>
        <header className="mb-5 flex items-end justify-between gap-4">
          <div className="flex flex-col gap-1">
            <span className="text-[11px] uppercase tracking-[0.16em] text-ink-tertiary font-medium">
              Roadmap
            </span>
            <h2 className="text-display text-[24px] md:text-[28px] leading-tight font-medium text-ink">
              6 admin pages incoming
            </h2>
          </div>
        </header>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {PLANNED_PAGES.map((p) => (
            <IntegrationStatusCard
              key={p.name}
              name={p.name}
              description={p.description}
              icon={p.icon}
              status={p.status}
              configureHref={p.href}
              detail={p.detail}
              scope="platform"
            />
          ))}
        </div>
      </div>
    </div>
  );
}
