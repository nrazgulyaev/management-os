import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
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
  const failed = rows.filter((r) => r.status === "failed").length;
  const dryRun = isNotificationsDryRun();
  const resendOn = isResendConfigured();
  const twilioOn = isTwilioConfigured();

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Notifications" }]}
        title="Notification queue"
        description="Durable queue + provider deliveries. In-app inbox always works; email / SMS / WhatsApp ship when Resend / Twilio env is configured and dry-run is off."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <Link
              href="/dashboard/notifications/inbox"
              className="rounded-md border border-line-soft bg-surface px-3 py-1.5 text-xs hover:border-line-strong inline-flex items-center gap-2"
            >
              Inbox
              {unreadCount > 0 && <Badge tone="warning">{unreadCount}</Badge>}
            </Link>
            <Link
              href="/dashboard/notifications/deliveries"
              className="text-xs underline text-ink-secondary"
            >
              Deliveries →
            </Link>
            <Link
              href="/dashboard/notifications/preferences"
              className="text-xs underline text-ink-secondary"
            >
              Preferences →
            </Link>
          </div>
        }
      />
      <DbStatusNotice />

      <div className="rounded-md border border-line-soft bg-surface px-4 py-3 flex items-center gap-3 flex-wrap text-xs">
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Total (visible)" value={String(rows.length)} />
        <MetricCard label="Queued" value={String(queued)} accent={queued > 0} />
        <MetricCard label="Failed" value={String(failed)} accent={failed > 0} />
        <MetricCard
          label="In-app"
          value={String(rows.filter((r) => r.channel === "in_app").length)}
        />
      </div>

      <div className="flex flex-wrap gap-2">
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

      <Section eyebrow="Queue" title="Recent notifications">
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            No notifications match these filters.
          </p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Status</TH>
                <TH>Channel</TH>
                <TH>Template</TH>
                <TH>Title / body</TH>
                <TH>Recipient</TH>
                <TH>Attempts</TH>
                <TH>Created</TH>
                <TH>Action</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <NotificationStatusPill status={r.status} />
                  </TD>
                  <TD>
                    <Badge tone="outline">{r.channel}</Badge>
                  </TD>
                  <TD className="font-mono text-xs">{r.templateKey}</TD>
                  <TD className="text-xs max-w-[420px]">
                    <div className="text-ink">{r.title}</div>
                    <div className="text-ink-tertiary truncate">{r.body}</div>
                  </TD>
                  <TD className="text-xs">
                    <Badge tone="outline">{r.recipientType}</Badge>
                  </TD>
                  <TD className="text-xs font-mono tabular-nums">
                    <div>{r.deliveryAttempts}</div>
                    {r.lastAttemptedAt && (
                      <div className="text-[10px] text-ink-tertiary">
                        last {r.lastAttemptedAt.slice(0, 16).replace("T", " ")}
                      </div>
                    )}
                    {r.nextAttemptAt && (
                      <div className="text-[10px] text-warning">
                        next {r.nextAttemptAt.slice(0, 16).replace("T", " ")}
                      </div>
                    )}
                  </TD>
                  <TD className="text-xs text-ink-tertiary tabular-nums">
                    {r.createdAt.slice(0, 16).replace("T", " ")}
                  </TD>
                  <TD>
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
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </div>
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
