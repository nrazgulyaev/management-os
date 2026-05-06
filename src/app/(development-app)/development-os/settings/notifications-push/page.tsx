import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { PushPermission } from "@/components/development/pwa/push-permission";
import { getCurrentAppUser } from "@/features/auth/current-user";
import { listUserSubscriptions } from "@/lib/development/server/push/subscription-queries";

export const metadata: Metadata = { title: "Push notifications · Settings" };
export const dynamic = "force-dynamic";

export default async function PushSettingsPage() {
  const me = await getCurrentAppUser();
  const subs = me ? await listUserSubscriptions(me.id) : [];

  return (
    <DevelopmentShell>
      <PageHeader
        title="Push notifications"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings" },
          { label: "Push notifications" },
        ]}
        description="Per-device push subscriptions and notification preferences."
      />

      <Section title="Enable on this device">
        {!me ? (
          <EmptyState title="Sign in" description="Log in to manage subscriptions." />
        ) : (
          <PushPermission />
        )}
      </Section>

      <Section title={`${subs.length} subscription(s) on file`}>
        {subs.length === 0 ? (
          <EmptyState
            title="No devices subscribed"
            description="Use 'Enable notifications' above to subscribe this device."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Device</th>
                <th>Type</th>
                <th>Status</th>
                <th>Failures</th>
                <th>Subscribed</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <tr key={s.id} className="border-b border-line-soft">
                  <td className="py-2">{s.deviceLabel ?? "Unnamed device"}</td>
                  <td className="text-xs">{s.deviceType ?? "—"}</td>
                  <td>
                    <Badge tone={s.isActive ? "success" : "neutral"}>
                      {s.isActive ? "active" : "inactive"}
                    </Badge>
                  </td>
                  <td className="font-mono tabular-nums text-xs">
                    {s.consecutiveFailures}
                  </td>
                  <td className="text-xs text-ink-tertiary">
                    {new Date(s.subscribedAt).toLocaleDateString()}
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
