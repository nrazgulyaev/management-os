import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DbStatusNotice } from "@/components/admin/db-status";
import { NotificationStatusPill } from "@/components/jobs/job-status-pill";
import { NotificationActions } from "@/components/notifications/notification-actions";
import { listNotifications } from "@/features/notifications/services";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";

export const metadata = { title: "Notifications" };
export const dynamic = "force-dynamic";

const STATUSES = ["queued", "sent", "suppressed", "failed", "cancelled"];

export default async function NotificationsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; channel?: string; templateKey?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listNotifications({
    status: sp.status,
    channel: sp.channel,
    templateKey: sp.templateKey,
    limit: 200,
  });
  const ctx = await getCurrentUserContext();
  const canManage = hasPermission(ctx, "notifications.manage");
  const canWrite = hasPermission(ctx, "notifications.write");

  const queued = rows.filter((r) => r.status === "queued").length;
  const failed = rows.filter((r) => r.status === "failed").length;

  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[{ label: "Notifications" }]}
        title="Notification queue"
        description="Durable queue for in-app, email, WhatsApp, SMS, Telegram. External delivery providers ship in v8 — for now this is the storage + ops UI."
        actions={
          <Link href="/dashboard/notifications/preferences" className="text-xs underline text-ink-secondary">
            Preferences →
          </Link>
        }
      />
      <DbStatusNotice />

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
                <TH>Priority</TH>
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
                  <TD>
                    <Badge
                      tone={
                        r.priority === "urgent"
                          ? "danger"
                          : r.priority === "high"
                            ? "warning"
                            : "neutral"
                      }
                    >
                      {r.priority}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-ink-tertiary tabular-nums">
                    {r.createdAt.slice(0, 16).replace("T", " ")}
                  </TD>
                  <TD>
                    <NotificationActions
                      id={r.id}
                      status={r.status}
                      canManage={canManage}
                      canWrite={canWrite}
                    />
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
