import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getOrganizationByCode } from "@/lib/development/server/organizations/organization-queries";
import { listWebhookSubscriptions } from "@/lib/development/server/webhooks/webhook-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { WebhookModalForm } from "@/components/development/platform/webhook-modal-form";

export const metadata: Metadata = { title: "Webhooks · Settings" };
export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const me = await getCurrentAppUser();
  const org = await safeQuery(
    "settings-webhooks.getOrganizationByCode",
    getOrganizationByCode("ARCONIQUE_DEFAULT"),
    null,
  );
  const subs = org
    ? await safeQuery(
        "settings-webhooks.listWebhookSubscriptions",
        listWebhookSubscriptions(org.id),
        [] as Awaited<ReturnType<typeof listWebhookSubscriptions>>,
      )
    : [];

  return (
    <DevelopmentShell>
      <PageHeader
        title="Webhook subscriptions"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings" },
          { label: "Webhooks" },
        ]}
        description="Outbound HTTP notifications. Each delivery is HMAC-SHA256 signed (Stripe-style header). Subscriptions auto-disable after 10 consecutive failures."
        actions={
          org ? (
            <WebhookModalForm organizationId={org.id} currentUserId={me?.id} />
          ) : null
        }
      />

      <Section title={`${subs.length} subscription(s)`}>
        {subs.length === 0 ? (
          <EmptyState
            title="No webhook subscriptions"
            description="Use the subscribeWebhook server action or POST /api/v1/webhooks/test to register an endpoint."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Label</th>
                <th>Endpoint</th>
                <th>Events</th>
                <th>Failures</th>
                <th>Last success</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-b border-line-soft align-top">
                  <td className="py-2">{s.webhookLabel}</td>
                  <td className="text-xs text-ink-tertiary break-all">
                    {s.endpointUrl}
                  </td>
                  <td className="text-xs">
                    {(s.subscribedEvents ?? []).join(", ") || "—"}
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {s.consecutiveFailures}
                  </td>
                  <td className="text-xs text-ink-tertiary">
                    {s.lastSuccessfulDeliveryAt
                      ? new Date(s.lastSuccessfulDeliveryAt).toLocaleString()
                      : "never"}
                  </td>
                  <td>
                    <Badge tone={s.isActive ? "success" : "neutral"}>
                      {s.isActive ? "active" : "disabled"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
