/**
 * Integrations command center.
 *
 * Stage 10.6.D.2 stood this page up as an env-presence status grid; #162
 * (settings-honest-connect) added the live per-org connect/test/disconnect
 * section. block10-integrations-hub DEEPENS it to the contract's "3 trust
 * tiers, dry-run with no false-green" bar:
 *
 *   - The catalog grid below no longer maps env-presence → green
 *     "Configured". Every platform integration now shows the REAL 3-tier
 *     trust badge (real / dry-run / ignored / error) resolved server-side
 *     via `resolvePlatformIntegrationTrust()` — Stripe capture + OTA push
 *     read "Dry-run" (simulated), email/messaging/AI read "Dry-run" when
 *     their *_DRY_RUN flag is set or keys are absent, and the KMS keystone
 *     reads "Error" when missing. No false green is possible.
 *   - Each card carries a REAL Test-connection probe (Anthropic / Resend /
 *     Twilio hit the upstream; the rest honestly report dry-run /
 *     not-configured) + an encryption-at-rest indicator.
 *   - A per-org messaging-credentials banner surfaces whether THIS org has
 *     saved (encrypted) WhatsApp creds driving the runtime.
 */

import type { Metadata } from "next";
import {
  Banknote,
  CreditCard,
  KeyRound,
  Lock,
  Mail,
  MessageSquare,
  Package,
  Plug,
  Smartphone,
  Sparkles,
  Workflow,
} from "lucide-react";
import { Card, Kpi, SectionHeading } from "@/components/dashboard/primitives";
import {
  resolvePlatformIntegrationTrust,
  summarizePlatformTrust,
  type PlatformIntegrationKey,
} from "@/lib/integrations/platform-trust";
import { requireOrgId } from "@/features/auth/require-org";
import { loadOrgWhatsAppCredentials } from "@/lib/whatsapp/org-credentials";
import { isStayLinkKmsConfigured } from "@/lib/env";
import { ConnectedIntegrations } from "./_connected-integrations";
import { PlatformIntegrationCard } from "./_platform-integration-card";

export const metadata: Metadata = {
  title: "Integrations · Settings",
};
export const dynamic = "force-dynamic";

/** Display metadata per integration key — paired with the trust resolver. */
const CATALOG_META: Record<
  PlatformIntegrationKey,
  {
    name: string;
    description: string;
    icon: React.ReactNode;
    scope: "per-org" | "platform";
    configureHref?: string;
  }
> = {
  ai_anthropic: {
    name: "AI providers",
    description:
      "Anthropic / OpenAI / Gemini. Per-org per-agent keys, encrypted at rest, with a real test-connection.",
    icon: <Sparkles className="w-5 h-5" />,
    scope: "per-org",
    configureHref: "/dashboard/settings/ai-agents",
  },
  resend_email: {
    name: "Resend (transactional email)",
    description:
      "Welcome, statement-ready, owner notifications, trial reminders.",
    icon: <Mail className="w-5 h-5" />,
    scope: "platform",
    configureHref: "/dashboard/settings",
  },
  twilio_messaging: {
    name: "WhatsApp / Twilio messaging",
    description:
      "Per-org WhatsApp Business number + Twilio fallback driving the runtime.",
    icon: <MessageSquare className="w-5 h-5" />,
    scope: "per-org",
    configureHref: "/development-os/settings/whatsapp",
  },
  twilio_sms: {
    name: "SMS (Twilio)",
    description: "Optional SMS fallback for guest / staff notifications.",
    icon: <Smartphone className="w-5 h-5" />,
    scope: "platform",
  },
  stripe_billing: {
    name: "Stripe Connect / PSP",
    description:
      "Subscription billing + payment capture. Deferred until launch — manual mark-paid only today.",
    icon: <CreditCard className="w-5 h-5" />,
    scope: "per-org",
    configureHref: "/dashboard/payments/providers",
  },
  ota_push: {
    name: "Channel managers (OTA push)",
    description:
      "Booking.com / Airbnb / Agoda outbound rate + availability push. Inbound sync is managed per-org above.",
    icon: <Plug className="w-5 h-5" />,
    scope: "per-org",
    configureHref: "/development-os/channels",
  },
  document_storage: {
    name: "Document storage",
    description: "Supabase Storage. R2 / S3 migration planned, not shipped.",
    icon: <Package className="w-5 h-5" />,
    scope: "platform",
    configureHref: "/dashboard/system/storage",
  },
  supabase_auth: {
    name: "Auth (Supabase + Google OAuth)",
    description: "Sign-in, magic links, MFA, Google sign-in. Platform-wide.",
    icon: <KeyRound className="w-5 h-5" />,
    scope: "platform",
  },
  cron_jobs: {
    name: "Cron / scheduled jobs",
    description:
      "Vercel Cron triggers (trial state, daily metrics, preventive tasks).",
    icon: <Workflow className="w-5 h-5" />,
    scope: "platform",
    configureHref: "/dashboard/jobs",
  },
  credential_kms: {
    name: "Credential KMS",
    description:
      "AES-256-GCM platform secret encrypting every per-org credential.",
    icon: <Banknote className="w-5 h-5" />,
    scope: "platform",
  },
};

export default async function IntegrationsHubPage() {
  const trust = resolvePlatformIntegrationTrust();
  const counts = summarizePlatformTrust(trust);

  // Per-org messaging credentials — surface whether THIS org has saved
  // (encrypted) WhatsApp creds driving the runtime, plus the platform KMS
  // health that protects them.
  const kmsReady = isStayLinkKmsConfigured();
  let orgMessagingConnected = false;
  let messagingFromNumber: string | null = null;
  try {
    const orgId = await requireOrgId();
    const creds = await loadOrgWhatsAppCredentials(orgId);
    orgMessagingConnected = Boolean(creds);
    messagingFromNumber = creds?.fromNumber ?? null;
  } catch {
    // Anonymous / pre-auth render — leave defaults.
  }

  const available = counts.dryRun + counts.ignored;

  return (
    <div className="flex flex-col gap-10">
      <SectionHeading
        eyebrow="Connections · channels, payments, messaging"
        title={<>Integrations</>}
        subtitle={`Trust tiers are resolved from each integration's real runtime — never env-presence. ${counts.real} real · ${counts.dryRun} dry-run · ${counts.ignored} ignored · ${counts.error} error.`}
      />

      <div className="dist-kpis">
        <Kpi
          label="Connected"
          value={String(counts.real)}
          sub="services"
          tone={counts.real > 0 ? "success" : undefined}
        />
        <Kpi
          label="Dry-run"
          value={String(counts.dryRun)}
          sub="simulated"
          tone={counts.dryRun > 0 ? "warn" : undefined}
        />
        <Kpi
          label="Errors"
          value={String(counts.error)}
          sub={counts.error > 0 ? "needs attention" : "all healthy"}
          tone={counts.error > 0 ? "danger" : undefined}
        />
        <Kpi label="Available" value={String(available)} sub="not connected" />
      </div>

      {/* Encryption + per-org messaging credentials banner. */}
      <Card
        padding="default"
        className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <span
            className={
              kmsReady
                ? "flex h-9 w-9 items-center justify-center rounded-[10px] bg-success-weak/50 text-ok"
                : "flex h-9 w-9 items-center justify-center rounded-[10px] bg-danger-weak/50 text-danger"
            }
          >
            <Lock className="h-4 w-4" strokeWidth={2} />
          </span>
          <div className="flex flex-col">
            <span className="text-[14px] font-semibold text-ink">
              Credential encryption {kmsReady ? "active" : "MISSING"}
            </span>
            <span className="text-[12.5px] text-ink-3">
              {kmsReady
                ? "All per-org credentials are sealed AES-256-GCM at rest via the platform KMS."
                : "STAY_LINK_KMS_SECRET is unset — per-org credentials would fall back to plaintext. Set it before connecting integrations."}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 text-[12.5px] text-ink-3">
          <MessageSquare className="h-4 w-4 text-ink-4" strokeWidth={1.75} />
          {orgMessagingConnected ? (
            <span>
              This org has saved WhatsApp credentials
              {messagingFromNumber ? ` (${messagingFromNumber})` : ""} — encrypted
              and driving the runtime.
            </span>
          ) : (
            <span>
              No per-org WhatsApp credentials saved — messaging falls back to env
              or the dry-run provider.
            </span>
          )}
        </div>
      </Card>

      <ConnectedIntegrations />

      <section>
        <SectionHeading
          eyebrow="Catalog"
          title={<>All external services</>}
          subtitle="Every platform integration with its truthful trust tier and a real test-connection. A present API key is never enough for a green badge — the runtime has to genuinely call the upstream."
        />
        <div className="grid grid-cols-1 gap-[14px] md:grid-cols-2 lg:grid-cols-3">
          {trust.map((t) => {
            const meta = CATALOG_META[t.key];
            return (
              <PlatformIntegrationCard
                key={t.key}
                integrationKey={t.key}
                name={meta.name}
                description={meta.description}
                icon={meta.icon}
                scope={meta.scope}
                tier={t.tier}
                reason={t.reason}
                hasProbe={t.probe !== "none"}
                encryptedAtRest={t.encryptedAtRest}
                simulated={t.simulated}
                configureHref={meta.configureHref}
              />
            );
          })}
        </div>
      </section>
    </div>
  );
}
