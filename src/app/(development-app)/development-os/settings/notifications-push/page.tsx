import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Settings</span> / <span>Push notifications</span>
          </div>
          <h1>Push notifications</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Per-device push subscriptions and notification preferences.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/settings/notifications-push/compose"
            className="btn btn-primary btn-sm"
          >
            Send notification
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Enable on this device</div>
        <Card padding="default">
          {!me ? (
            <EmptyState title="Sign in" description="Log in to manage subscriptions." />
          ) : (
            <PushPermission />
          )}
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">{subs.length} subscription(s) on file</div>
        {subs.length === 0 ? (
          <Card padding="default">
            <EmptyState
              title="No devices subscribed"
              description="Use 'Enable notifications' above to subscribe this device."
            />
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Device</th>
                  <th scope="col">Type</th>
                  <th scope="col">Status</th>
                  <th scope="col" className="num">Failures</th>
                  <th scope="col">Subscribed</th>
                </tr>
              </thead>
              <tbody>
                {subs.map((s) => (
                  <tr key={s.id}>
                    <td className="row-title">{s.deviceLabel ?? "Unnamed device"}</td>
                    <td className="text-xs">{s.deviceType ?? "—"}</td>
                    <td>
                      <HandoffBadge tone={s.isActive ? "ok" : "soft"}>
                        {s.isActive ? "active" : "inactive"}
                      </HandoffBadge>
                    </td>
                    <td className="num mono text-xs">
                      {s.consecutiveFailures}
                    </td>
                    <td className="text-xs text-ink-3">
                      {new Date(s.subscribedAt).toLocaleDateString()}
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
