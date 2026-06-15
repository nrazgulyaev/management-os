import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { DevelopmentShell } from "@/components/development/development-shell";
import { ComposePushForm } from "./_compose-form";
import {
  listOrgRoleKeys,
  listOrgSubscriptions,
  listOrgUsers,
  listRecentDispatches,
} from "./_queries";

export const metadata: Metadata = {
  title: "Send push notification · Settings",
};
export const dynamic = "force-dynamic";

const STATUS_TONE: Record<
  string,
  "ok" | "warn" | "danger" | "info" | "soft"
> = {
  delivered: "ok",
  dispatched: "info",
  pending: "warn",
  failed: "danger",
};

function targetLabel(row: {
  targetRole: string | null;
  targetUserId: string | null;
  targetSubscriptionId: string | null;
}): string {
  if (row.targetRole) return `role · ${row.targetRole}`;
  if (row.targetUserId) return "user";
  if (row.targetSubscriptionId) return "device";
  return "—";
}

export default async function ComposePushPage() {
  // All four loads are org-scoped via requireOrgId inside the query module.
  const [users, subscriptions, roles, dispatches] = await Promise.all([
    listOrgUsers(),
    listOrgSubscriptions(),
    listOrgRoleKeys(),
    listRecentDispatches(50),
  ]);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Settings</span> /{" "}
            <Link href="/development-os/settings/notifications-push">
              Push notifications
            </Link>{" "}
            / <span>Send</span>
          </div>
          <h1>Send push notification</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Compose a push and schedule it for delivery to a role, a single
            user, or one subscribed device. The dispatch is logged below with a
            tracking code and status.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/settings/notifications-push"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Subscriptions
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Composer</div>
        <Card padding="default">
          <ComposePushForm
            users={users}
            subscriptions={subscriptions}
            roles={roles}
          />
        </Card>
      </div>

      <div>
        <div className="label mb-2.5">
          Dispatch log ({dispatches.length})
        </div>
        {dispatches.length === 0 ? (
          <Card padding="default">
            <EmptyState
              title="No notifications dispatched yet"
              description="Sent notifications appear here with their dispatch code and delivery status."
            />
          </Card>
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Title</th>
                  <th scope="col">Type</th>
                  <th scope="col">Target</th>
                  <th scope="col">Status</th>
                  <th scope="col">Scheduled</th>
                </tr>
              </thead>
              <tbody>
                {dispatches.map((d) => (
                  <tr key={d.id}>
                    <td className="mono text-xs">{d.dispatchCode}</td>
                    <td className="row-title">{d.title}</td>
                    <td className="text-xs">{d.notificationType}</td>
                    <td className="text-xs text-ink-3">{targetLabel(d)}</td>
                    <td>
                      <HandoffBadge tone={STATUS_TONE[d.dispatchStatus] ?? "soft"}>
                        {d.dispatchStatus}
                      </HandoffBadge>
                    </td>
                    <td className="text-xs text-ink-3">
                      {new Date(d.scheduledAt).toLocaleString()}
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
