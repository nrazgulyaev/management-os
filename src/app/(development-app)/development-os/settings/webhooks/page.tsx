import type { Metadata } from "next";
import Link from "next/link";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { requireOrgId } from "@/features/auth/require-org";
import { listWebhookSubscriptions } from "@/lib/development/server/webhooks/webhook-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { WebhookModalForm } from "@/components/development/platform/webhook-modal-form";

export const metadata: Metadata = { title: "Webhooks · Settings" };
export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const me = await getCurrentAppUser();
  const orgId = await requireOrgId();
  const subs = await safeQuery(
    "settings-webhooks.listWebhookSubscriptions",
    listWebhookSubscriptions(orgId),
    [] as Awaited<ReturnType<typeof listWebhookSubscriptions>>,
  );

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/settings">Settings</Link> /{" "}
            <span>Webhooks</span>
          </div>
          <h1>Webhook subscriptions</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Outbound HTTP notifications. Each delivery is HMAC-SHA256 signed
            (Stripe-style header). Subscriptions auto-disable after 10
            consecutive failures.
          </p>
        </div>
        <div className="actions">
          <WebhookModalForm organizationId={orgId} currentUserId={me?.id} />
        </div>
      </div>

      <div>
        <div className="label mb-2.5">{`${subs.length} subscription(s)`}</div>
        {subs.length === 0 ? (
          <Card padding="default">
            <EmptyState
              title="No webhook subscriptions"
              description="Use the subscribeWebhook server action or POST /api/v1/webhooks/test to register an endpoint."
            />
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Label</th>
                  <th scope="col">Endpoint</th>
                  <th scope="col">Events</th>
                  <th scope="col" className="num">Failures</th>
                  <th scope="col">Last success</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id} className="align-top">
                    <td className="row-title">{s.webhookLabel}</td>
                    <td className="text-[12px] text-ink-3 break-all">
                      {s.endpointUrl}
                    </td>
                    <td className="text-[12px]">
                      {(s.subscribedEvents ?? []).join(", ") || "—"}
                    </td>
                    <td className="num mono text-[12px]">
                      {s.consecutiveFailures}
                    </td>
                    <td className="text-[12px] text-ink-3">
                      {s.lastSuccessfulDeliveryAt
                        ? new Date(s.lastSuccessfulDeliveryAt).toLocaleString()
                        : "never"}
                    </td>
                    <td>
                      <HandoffBadge tone={s.isActive ? "ok" : "soft"}>
                        {s.isActive ? "active" : "disabled"}
                      </HandoffBadge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
