import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
import { Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { DbStatusNotice } from "@/components/admin/db-status";
import { NotificationStatusPill } from "@/components/jobs/job-status-pill";
import { NotificationActions } from "@/components/notifications/notification-actions";
import {
  DeliverPendingButton,
  QueueDigestNowButton,
  RetryNotificationButton,
} from "@/components/notifications/queue-actions";
import {
  countUnreadForCurrentUser,
  listNotificationsWithAttempts,
} from "@/features/notifications/services";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";
import { isNotificationsDryRun, isResendConfigured, isTwilioConfigured } from "@/lib/env";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const STATUSES = ["queued", "sent", "suppressed", "failed", "cancelled"];

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; channel?: string; templateKey?: string }>;
}) {
  const sp = await searchParams;
  const [rows, unreadCount] = await Promise.all([
    listNotificationsWithAttempts({ status: sp.status, limit: 200 }),
    countUnreadForCurrentUser(),
  ]);
  const ctx = await getCurrentUserContext();
  const canManage = hasPermission(ctx, "notifications.manage");
  const canWrite = hasPermission(ctx, "notifications.write");

  const queued = rows.filter((r) => r.status === "queued").length;
  const sent = rows.filter((r) => r.status === "sent").length;
  const failed = rows.filter((r) => r.status === "failed").length;
  const dryRun = isNotificationsDryRun();
  const resendOn = isResendConfigured();
  const twilioOn = isTwilioConfigured();

  return (
    <>
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard">Dashboard</Link> / <span>Notifications</span>
          </div>
          <h1>Notification queue</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            In-app inbox + durable delivery queue. The inbox always works; email /
            SMS / WhatsApp ship when Resend / Twilio is configured and dry-run is
            off.
          </p>
        </div>
        <div className="actions">
          <Link href="/dashboard/notifications/deliveries" className="btn btn-secondary btn-sm">
            Deliveries →
          </Link>
          <Link
            href="/dashboard/notifications/inbox"
            className="btn btn-secondary btn-sm inline-flex items-center gap-2"
          >
            Inbox
            {unreadCount > 0 && <Badge tone="warning">{unreadCount}</Badge>}
          </Link>
          <Link href="/dashboard/notifications/preferences" className="btn btn-accent btn-sm">
            Preferences
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-[18px] mb-[18px]">
        <Kpi
          label="Unread"
          value={String(unreadCount)}
          sub="your inbox"
          tone={unreadCount > 0 ? "accent" : undefined}
        />
        <Kpi label="Queued" value={String(queued)} sub="pending delivery" />
        <Kpi
          label="Sent"
          value={String(sent)}
          sub="delivered"
          tone={sent > 0 ? "success" : undefined}
        />
        <Kpi
          label="Failed"
          value={String(failed)}
          sub={failed > 0 ? "need retry" : "none"}
          tone={failed > 0 ? "accent" : undefined}
        />
      </div>

      <DbStatusNotice />

      {/* Provider mode */}
      <div className="rounded-md border border-line-soft bg-surface px-4 py-3 flex items-center gap-3 flex-wrap text-xs mt-[18px]">
        <span className="text-ink-tertiary">Provider mode</span>
        <Badge tone={dryRun ? "warning" : "success"}>
          {dryRun ? "dry-run (noop)" : "live"}
        </Badge>
        <Badge tone={resendOn ? "success" : "neutral"}>
          email · {resendOn ? "Resend" : "noop"}
        </Badge>
        <Badge tone={twilioOn ? "success" : "neutral"}>
          sms / wa · {twilioOn ? "Twilio" : "noop"}
        </Badge>
        {canManage && (
          <div className="flex items-center gap-2 ml-auto">
            <DeliverPendingButton />
            <QueueDigestNowButton />
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 mt-4">
        <FilterPill label="All" href="/dashboard/notifications" active={!sp.status} />
        {STATUSES.map((s) => (
          <FilterPill
            key={s}
            label={s}
            href={`/dashboard/notifications?status=${s}`}
            active={sp.status === s}
          />
        ))}
      </div>

      <h2 className="display text-[22px] font-normal mt-6 mb-3.5">Recent notifications</h2>
      <div className="card p-0 overflow-hidden">
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Status</th>
              <th scope="col">Channel</th>
              <th scope="col">Template</th>
              <th scope="col">Title / body</th>
              <th scope="col">Recipient</th>
              <th scope="col" className="num">Attempts</th>
              <th scope="col">Created</th>
              <th scope="col">Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={8}>No notifications match these filters.</TableEmpty>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className={r.status === "queued" ? "bg-cream-warm" : ""}>
                  <td>
                    <NotificationStatusPill status={r.status} />
                  </td>
                  <td>
                    <Badge tone="outline">{r.channel}</Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-3">{r.templateKey}</td>
                  <td className="max-w-[420px]">
                    <div className="text-ink text-[13px]">{r.title}</div>
                    <div className="text-ink-3 text-[12px] truncate">{r.body}</div>
                  </td>
                  <td>
                    <Badge tone="outline">{r.recipientType}</Badge>
                  </td>
                  <td className="num mono text-[12px]">
                    <div>{r.deliveryAttempts}</div>
                    {r.lastAttemptedAt && (
                      <div className="text-[10px] text-ink-4">
                        last {r.lastAttemptedAt.slice(0, 16).replace("T", " ")}
                      </div>
                    )}
                    {r.nextAttemptAt && (
                      <div className="text-[10px] text-warning">
                        next {r.nextAttemptAt.slice(0, 16).replace("T", " ")}
                      </div>
                    )}
                  </td>
                  <td className="mono text-[11px] text-ink-3 whitespace-nowrap">
                    {r.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td>
                    <div className="flex flex-col gap-1">
                      <NotificationActions
                        id={r.id}
                        status={r.status}
                        canManage={canManage}
                        canWrite={canWrite}
                      />
                      {canManage && (r.status === "failed" || r.status === "queued") && (
                        <RetryNotificationButton id={r.id} />
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

function FilterPill({
  label,
  href,
  active,
}: {
  label: string;
  href: string;
  active: boolean;
}) {
  return (
    <Link
      href={href}
      className={`text-[11px] uppercase tracking-widest px-3 py-1.5 rounded-full border ${
        active
          ? "bg-ink text-ink-inverse border-ink"
          : "border-line-soft text-ink-secondary hover:border-line-strong"
      }`}
    >
      {label}
    </Link>
  );
}
