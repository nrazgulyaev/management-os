import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check, Circle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { and, eq } from "drizzle-orm";
import {
  getWhatsappPhoneNumbers,
  getWhatsappTemplates,
} from "@/lib/development/server/whatsapp-actions";
import { safeQuery } from "@/lib/development/safe-query";
import { getWhatsAppProvider } from "@/lib/whatsapp/providers";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { oauthConnections } from "@/lib/db/schema/bulk-import";
import { WhatsappCredentialForm } from "@/components/settings/whatsapp-credential-form";

export const metadata: Metadata = {
  title: "WhatsApp setup · Development OS",
};
export const dynamic = "force-dynamic";

export default async function WhatsappSetupPage() {
  const db = getDb();
  const provider = getWhatsAppProvider();
  const health = await provider.healthCheck().catch(() => ({
    healthy: false,
    details: "Health check threw",
  }));

  const expectedWebhookUrl = `${
    process.env.APP_BASE_URL ?? "https://your-domain.example.com"
  }/api/whatsapp/webhook`;

  let arconiquePhones: Array<{ id: string; phoneNumber: string }> = [];
  let templates: Array<{ id: string; approvalStatus: string }> = [];
  let org: { id: string } | null = null;
  let hasSavedCreds = false;
  if (db) {
    const [phones, t] = await Promise.all([
      safeQuery(
        "getWhatsappPhoneNumbers(arconique_outbound)",
        getWhatsappPhoneNumbers({ type: "arconique_outbound" }),
        [],
        4000,
      ),
      safeQuery("getWhatsappTemplates", getWhatsappTemplates(), [], 4000),
    ]);
    arconiquePhones = phones;
    templates = t;
    org = await getOrganizationByCode("ARCONIQUE_DEFAULT");
    if (org) {
      const [existingCreds] = await db
        .select({ id: oauthConnections.id })
        .from(oauthConnections)
        .where(
          and(
            eq(oauthConnections.organizationId, org.id),
            eq(oauthConnections.provider, "twilio_whatsapp"),
            eq(oauthConnections.isActive, true),
          ),
        )
        .limit(1);
      hasSavedCreds = !!existingCreds;
    }
  }
  const approvedTemplateCount = templates.filter(
    (t) => t.approvalStatus === "approved",
  ).length;

  // Operational checklist — visual readiness check.
  const checklist: Array<{ label: string; ok: boolean; hint?: string }> = [
    {
      label: "Provider selected",
      ok: provider.name !== "dry_run",
      hint:
        provider.name === "dry_run"
          ? "Set TWILIO_ACCOUNT_SID + TWILIO_AUTH_TOKEN to use Twilio"
          : `Using ${provider.name}`,
    },
    {
      label: "Provider health check passing",
      ok: health.healthy,
      hint: health.details,
    },
    {
      label: "Production mode (not sandbox)",
      ok: !provider.isSandbox(),
      hint: provider.isSandbox()
        ? "TWILIO_WHATSAPP_FROM_NUMBER is the Twilio sandbox — recipients must opt-in via 'join {keyword}'"
        : undefined,
    },
    {
      label: "At least one Arconique outbound number registered",
      ok: arconiquePhones.length > 0,
      hint:
        arconiquePhones.length === 0
          ? "Register a number in /development-os/whatsapp/phone-numbers"
          : `${arconiquePhones.length} registered`,
    },
    {
      label: "At least one approved template",
      ok: approvedTemplateCount > 0,
      hint:
        approvedTemplateCount === 0
          ? "Templates must be Meta-approved before they can be used outside the 24h conversation window"
          : `${approvedTemplateCount} approved`,
    },
    {
      label: "Webhook URL configured in Twilio Console",
      ok: false, // We can't detect this server-side; mark as manual.
      hint: `Configure ${expectedWebhookUrl} in Twilio's WhatsApp settings`,
    },
  ];

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings" },
          { label: "WhatsApp" },
        ]}
        title="WhatsApp setup"
        description="Operational configuration for the WhatsApp provider, webhook endpoint, and template approvals."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/whatsapp">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              WhatsApp
            </Link>
          </Button>
        }
      />

      <Section eyebrow="Section 1" title="Provider configuration">
        <div className="rounded-md border border-line-soft bg-surface p-4 space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Badge tone={health.healthy ? "success" : "warning"}>
              {provider.name}
            </Badge>
            {provider.isSandbox() && <Badge tone="warning">sandbox</Badge>}
          </div>
          <p className="text-ink-secondary">
            {health.details ?? "No additional details"}
          </p>
          <p className="text-xs text-ink-tertiary">
            <strong>Switch provider via env:</strong> set{" "}
            <code>WHATSAPP_PROVIDER=twilio</code> +{" "}
            <code>TWILIO_ACCOUNT_SID</code> +{" "}
            <code>TWILIO_AUTH_TOKEN</code> +{" "}
            <code>TWILIO_WHATSAPP_FROM_NUMBER</code>. Set{" "}
            <code>WHATSAPP_REQUIRE_REAL_PROVIDER=1</code> in production to
            refuse the DryRun fallback.
          </p>
        </div>
      </Section>

      {org && (
        <Section
          eyebrow="Per-org credentials"
          title="Per-org credentials (in-app form)"
          description="Saves Twilio credentials encrypted to oauth_connections. The runtime today still reads env vars; per-org routing is the future swap. The test-message button uses the env-based runtime for verification."
        >
          <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 mb-4">
            <strong>Heads-up:</strong> credentials saved here are encrypted
            but not yet picked up by the runtime — env vars take precedence
            until the per-org runtime swap lands. Save them to keep your
            secrets out of git + audit trail; verify operations via env
            for now.
          </div>
          <WhatsappCredentialForm
            organizationId={org.id}
            hasExistingConnection={hasSavedCreds}
          />
        </Section>
      )}

      <Section eyebrow="Section 2" title="Webhook configuration">
        <div className="rounded-md border border-line-soft bg-surface p-4 space-y-2 text-sm">
          <div>
            <span className="text-[11px] uppercase tracking-wide text-ink-tertiary">
              Expected webhook URL
            </span>
            <div className="font-mono text-sm break-all mt-1 bg-muted/30 p-2 rounded">
              {expectedWebhookUrl}
            </div>
          </div>
          <p className="text-xs text-ink-tertiary">
            Configure this URL in Twilio Console → Messaging → WhatsApp →
            your sender. Twilio sends inbound messages here as form-encoded
            POSTs and signs each request with{" "}
            <code>X-Twilio-Signature</code>. The endpoint verifies the HMAC-SHA1
            signature, persists the message with{" "}
            <code>status='received'</code>, and returns 200 OK in &lt; 1s. The
            inbound-processor cron picks up `received` rows every 2 minutes
            and runs the AI intent classifier.
          </p>
        </div>
      </Section>

      <Section eyebrow="Section 3" title="Operational checklist">
        <div className="rounded-md border border-line-soft bg-surface p-4">
          <ul className="space-y-2">
            {checklist.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                {item.ok ? (
                  <Check className="w-4 h-4 text-success mt-0.5 shrink-0" />
                ) : (
                  <Circle className="w-4 h-4 text-ink-tertiary mt-0.5 shrink-0" />
                )}
                <div className="flex-1">
                  <div>{item.label}</div>
                  {item.hint && (
                    <div className="text-xs text-ink-tertiary mt-0.5">
                      {item.hint}
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </div>
      </Section>

      <Section eyebrow="Section 4" title="Production deployment">
        <div className="rounded-md border border-line-soft bg-surface p-4 text-sm space-y-2">
          <ol className="list-decimal list-inside space-y-1 text-ink-secondary">
            <li>
              Create a Twilio account at{" "}
              <code>twilio.com</code>; complete WhatsApp Business profile.
            </li>
            <li>
              Submit your business for WhatsApp verification (5-7 day Meta review).
            </li>
            <li>Provision a WhatsApp number ($1-15/month).</li>
            <li>
              Set <code>TWILIO_ACCOUNT_SID</code>,{" "}
              <code>TWILIO_AUTH_TOKEN</code>,{" "}
              <code>TWILIO_WHATSAPP_FROM_NUMBER</code> env vars on Vercel.
            </li>
            <li>
              Configure webhook URL above in Twilio Console.
            </li>
            <li>
              Submit message templates for approval (24-48h Meta review).
            </li>
            <li>
              Mark approved templates in{" "}
              <Link
                href="/development-os/whatsapp/templates"
                className="text-info hover:underline"
              >
                /development-os/whatsapp/templates
              </Link>
              .
            </li>
            <li>
              Set{" "}
              <code>WHATSAPP_REQUIRE_REAL_PROVIDER=1</code> on production to
              fail loudly if Twilio creds are missing.
            </li>
            <li>Test inbound + outbound flows end-to-end.</li>
          </ol>
        </div>
      </Section>
    </DevelopmentShell>
  );
}
