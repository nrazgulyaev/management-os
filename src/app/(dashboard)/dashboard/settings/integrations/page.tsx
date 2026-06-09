/**
 * Stage 10.6.D.2 — Integrations command center.
 *
 * Surfaces all 15 external integrations in a single hub so the
 * operator can see at a glance: which are configured, which are
 * env-only, which need attention, and where to go to set each up.
 *
 * Status resolution is currently best-effort (driven by env-var
 * presence + a few quick DB lookups). Per-integration deep-dives
 * (Stripe Connect / Resend / WhatsApp / channels / Maps) get their
 * own dedicated sub-phases — this page links to them as they ship.
 */

import type { Metadata } from "next";
import {
  Banknote,
  CalendarRange,
  Cloud,
  CreditCard,
  KeyRound,
  Mail,
  MapPin,
  MessageSquare,
  Package,
  Plug,
  Smartphone,
  Sparkles,
  TrendingUp,
  Webhook,
  Workflow,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import {
  IntegrationStatusCard,
  type IntegrationStatusCardProps,
} from "@/components/ui/primitives";
import { isDbConfigured, isSupabaseAuthConfigured } from "@/lib/env";
import { ConnectedIntegrations } from "./_connected-integrations";

export const metadata: Metadata = {
  title: "Integrations · Settings",
};
export const dynamic = "force-dynamic";

function envSet(name: string): boolean {
  const v = process.env[name];
  return typeof v === "string" && v.trim().length > 0;
}

export default async function IntegrationsHubPage() {
  const dbReady = isDbConfigured();
  const authReady = isSupabaseAuthConfigured();
  const resendReady = envSet("RESEND_API_KEY");
  const twilioReady = envSet("TWILIO_ACCOUNT_SID") && envSet("TWILIO_AUTH_TOKEN");
  const anthropicReady = envSet("ANTHROPIC_API_KEY");
  const stripeReady = envSet("STRIPE_SECRET_KEY");
  const cronSecretReady = envSet("CRON_SECRET");
  const kmsReady = envSet("STAY_LINK_KMS_SECRET");

  const integrations: IntegrationStatusCardProps[] = [
    // ── At parity (10.5.B + 10.6.B.3) ──────────────────────────────────────
    {
      name: "AI providers",
      description:
        "Anthropic, OpenAI, Gemini. Per-org per-agent configuration with encrypted API keys + test connection.",
      icon: <Sparkles className="w-5 h-5" />,
      status: anthropicReady ? "configured" : "needs-config",
      scope: "per-org",
      configureHref: "/dashboard/settings/ai-agents",
      detail:
        "Reference implementation. 9 agents configurable per-org via /settings/ai-agents/[agent_key].",
      fallbackHint:
        "Manual mode is the default for every AI surface. Receipt OCR, tax classification, daily digest etc. all have manual fallback paths that work without an AI key.",
    },

    // ── Customer launch priority (10.6.D.2 deep dives) ────────────────────
    {
      name: "Stripe Connect",
      description:
        "Subscription billing + customer portal + payment processor connections. Required for SubscriptionOS billing collection.",
      icon: <CreditCard className="w-5 h-5" />,
      status: stripeReady ? "configured" : "needs-config",
      scope: "per-org",
      configureHref: "/dashboard/payments/providers",
      detail: stripeReady
        ? "STRIPE_SECRET_KEY set. Per-org Stripe customer IDs tracked in orgSubscriptions."
        : "Set STRIPE_SECRET_KEY env var to enable. Per-org connect UI ships soon.",
      fallbackHint:
        "Cash on arrival, bank transfer, and crypto (USDT) work without Stripe. Operator clicks 'Mark received' when funds land.",
    },
    {
      name: "Resend (transactional email)",
      description:
        "Customer-facing emails: welcome, statement-ready, owner notifications, trial reminders.",
      icon: <Mail className="w-5 h-5" />,
      status: resendReady ? "ready" : "needs-config",
      scope: "platform",
      configureHref: "/dashboard/settings/integrations/resend",
      detail: resendReady
        ? "Platform API key set. Per-org from-email override ships soon."
        : "Set RESEND_API_KEY + RESEND_FROM_EMAIL env. Currently emails fall back to NOTIFICATIONS_DRY_RUN.",
      fallbackHint:
        "Emails queue for manual send (open mailto: from the activity log) when Resend isn't configured. No auto-send, but no data loss.",
    },
    {
      name: "WhatsApp / Twilio messaging",
      description:
        "Per-org WhatsApp Business number + Twilio fallback. Operator-flagged for customer launch.",
      icon: <MessageSquare className="w-5 h-5" />,
      status: twilioReady ? "configured" : "needs-config",
      scope: "per-org",
      configureHref: "/development-os/settings/whatsapp",
      detail: twilioReady
        ? "Twilio platform credentials set. Per-org override UI ships in /development-os/settings/whatsapp."
        : "Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN to enable. Per-org Meta WhatsApp flow ships soon.",
      fallbackHint:
        "Concierge can copy composed messages to clipboard and paste into WhatsApp Web manually. Replies are recorded back into the conversation thread.",
    },
    {
      name: "Channel managers",
      description:
        "Booking.com, Airbnb, Agoda, Expedia OAuth + sync. Per-org per-villa configuration.",
      icon: <Plug className="w-5 h-5" />,
      status: "needs-config",
      scope: "per-org",
      configureHref: "/dashboard/integrations/channels",
      detail:
        "OAuth flow exists in /integrations/channels. Operator-flagged: 'cannot add new channel' — shipping verification + UI fix soon.",
      fallbackHint:
        "Manual booking entry works end-to-end. Channel sync is for auto-importing reservations from Booking.com / Airbnb / Agoda; without it the operator pastes booking details into /dashboard/bookings/new.",
    },
    {
      name: "Maps (Google Maps API)",
      description:
        "Villa coordinates, embedded maps on villa detail, public-facing portfolio map.",
      icon: <MapPin className="w-5 h-5" />,
      status: "not-available",
      scope: "platform",
      detail: "No UI yet. A follow-up adds per-org Maps API key + villa coordinate editor.",
      fallbackHint:
        "Villa addresses still work as plain text. Without Maps, the public portfolio map shows a static fallback image and the coordinate editor is hidden.",
    },

    // ── Working today, settings UI exists ─────────────────────────────────
    {
      name: "Calendar feeds (iCal)",
      description:
        "Airbnb / Booking.com / Vrbo iCal URLs synced into the booking calendar.",
      icon: <CalendarRange className="w-5 h-5" />,
      status: "configured",
      scope: "per-org",
      configureHref: "/dashboard/integrations/calendar-feeds",
      detail: "URLs stored plaintext (unguessable + RLS-protected); encryption planned soon.",
    },
    {
      name: "Banking sync",
      description: "Revolut / Wise / Mandiri / BCA. Per-org per-account encrypted credentials.",
      icon: <Banknote className="w-5 h-5" />,
      status: "configured",
      scope: "per-org",
      configureHref: "/development-os/banking",
      detail: "AES-256-GCM encrypted at rest. Plaid slot reserved (DryRun fallback).",
    },
    {
      name: "Marketing connections",
      description:
        "Google Analytics, Google Ads, Meta, TikTok, Mailchimp. Per-org per-account.",
      icon: <TrendingUp className="w-5 h-5" />,
      status: "configured",
      scope: "per-org",
      configureHref: "/development-os/marketing/connections",
      detail:
        "AES-256-GCM credentials. Live connect / test / disconnect controls are in the Live connections panel above.",
    },
    {
      name: "Webhooks (outbound)",
      description: "Per-org HMAC-signed webhook subscriptions for channel / payment / banking events.",
      icon: <Webhook className="w-5 h-5" />,
      status: "configured",
      scope: "per-org",
      configureHref: "/development-os/settings/webhooks",
      detail: "Signing secret encryption ships soon.",
    },

    // ── Platform-wide (env-only, working) ─────────────────────────────────
    {
      name: "SMS providers (Twilio SMS)",
      description: "Optional SMS fallback for guest / staff notifications.",
      icon: <Smartphone className="w-5 h-5" />,
      status: twilioReady ? "ready" : "not-available",
      scope: "platform",
      detail: twilioReady
        ? "Shares Twilio credentials with WhatsApp. Per-org override planned."
        : "Optional. Set TWILIO_FROM_SMS to enable.",
    },
    {
      name: "Document storage",
      description: "Supabase Storage default. R2 / S3 migration planned but not shipped.",
      icon: <Cloud className="w-5 h-5" />,
      status: dbReady ? "ready" : "not-available",
      scope: "platform",
      configureHref: "/dashboard/system/storage",
      detail: "Bucket health visible at /system/storage. Per-org bucket UI ships soon.",
    },
    {
      name: "Auth (Supabase Auth + Google OAuth)",
      description: "Sign-in, magic links, MFA, Google sign-in. Platform-wide Supabase Auth.",
      icon: <KeyRound className="w-5 h-5" />,
      status: authReady ? "ready" : "not-available",
      scope: "platform",
      detail: authReady
        ? "Platform Supabase Auth. Per-org SSO is a future initiative."
        : "Set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    },
    {
      name: "Cron / scheduled jobs",
      description: "Vercel Cron triggers (trial state, daily metrics, preventive task generation).",
      icon: <Workflow className="w-5 h-5" />,
      status: cronSecretReady ? "ready" : "not-available",
      scope: "platform",
      configureHref: "/development-os/jobs",
      detail: cronSecretReady
        ? "CRON_SECRET set. Last-run telemetry visible at /development-os/jobs."
        : "Set CRON_SECRET to enable scheduled jobs.",
    },
    {
      name: "Credential KMS",
      description:
        "AES-256-GCM platform-wide encryption secret used for all per-org credential storage.",
      icon: <Package className="w-5 h-5" />,
      status: kmsReady ? "ready" : "broken",
      scope: "platform",
      errorMessage: kmsReady
        ? undefined
        : "STAY_LINK_KMS_SECRET not set — every per-org integration above will fall back to plaintext storage.",
      detail: kmsReady
        ? "Platform key. Per-org key rotation is a future hardening initiative."
        : undefined,
    },
  ];

  const counts = {
    configured: integrations.filter((i) => i.status === "configured").length,
    ready: integrations.filter((i) => i.status === "ready").length,
    needsConfig: integrations.filter((i) => i.status === "needs-config").length,
    broken: integrations.filter((i) => i.status === "broken").length,
    notAvailable: integrations.filter((i) => i.status === "not-available").length,
  };

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Settings", href: "/dashboard/settings" },
          { label: "Integrations" },
        ]}
        eyebrow="Workspace"
        title="Integrations"
        description={`${integrations.length} external services. ${counts.configured} configured · ${counts.ready} ready · ${counts.needsConfig} need setup · ${counts.broken} need attention`}
      />

      <ConnectedIntegrations />

      <Section
        eyebrow="Catalog"
        title="All external services"
        description="Configuration state for every integration the platform talks to. Per-org sync connections above expose live connect / test / disconnect controls; the rest are configured via their own settings surfaces."
      >
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {integrations.map((integration) => (
            <IntegrationStatusCard key={integration.name} {...integration} />
          ))}
        </div>
      </Section>
    </div>
  );
}
