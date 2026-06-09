import Link from "next/link";
import { TableEmpty } from "@/components/ui/table-empty";
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
      <div className="section-heading flex items-end gap-[18px]">
        <div className="flex-1 min-w-0">
          <div className="eyebrow label">System · delivery inbox</div>
          <h1>
            What&apos;s been <em>sent</em>.
          </h1>
          <p>
            Queued, sent and failed notification envelopes across email and
            in-app channels. The inbox always works; email / SMS / WhatsApp ship
            when Resend / Twilio is configured and dry-run is off. Idempotent —
            re-runs never double-send.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Link
            href="/dashboard/notifications/deliveries"
            className="btn btn-secondary btn-sm"
          >
            Deliveries →
          </Link>
          <Link
            href="/dashboard/notifications/inbox"
            className="btn btn-secondary btn-sm inline-flex items-center gap-2"
          >
            Inbox
            {unreadCount > 0 && <Badge tone="warning">{unreadCount}</Badge>}
          </Link>
          <Link
            href="/dashboard/notifications/preferences"
            className="btn btn-accent btn-sm"
          >
            Preferences
          </Link>
        </div>
      </div>

      <div className="gs-kpis">
        <div className="kpi accent">
          <div className="label">Queued</div>
          <div className="v">{queued}</div>
          <div className="sub">pending delivery</div>
        </div>
        <div className={`kpi${sent > 0 ? " ok" : ""}`}>
          <div className="label">Sent</div>
          <div className="v">{sent}</div>
          <div className="sub">delivered</div>
        </div>
        <div className={`kpi${failed > 0 ? " warn" : ""}`}>
          <div className="label">Failed</div>
          <div className="v">{failed}</div>
          <div className="sub">{failed > 0 ? "need retry" : "none"}</div>
        </div>
        <div className={`kpi${unreadCount > 0 ? " accent" : ""}`}>
          <div className="label">Unread</div>
          <div className="v">{unreadCount}</div>
          <div className="sub">your inbox</div>
        </div>
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

      <div className="card card-pad mt-[18px]">
        <div className="gs-card-h">
          <h3>Recent envelopes</h3>
          <span className="meta">{rows.length} VISIBLE</span>
        </div>
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
