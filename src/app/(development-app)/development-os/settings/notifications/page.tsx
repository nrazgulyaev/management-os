import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { NotificationRulesTabs } from "@/components/development/notifications/notification-rules-tabs";
import {
  getNotificationDeliveryLog,
  getNotificationRules,
  getNotificationTemplates,
} from "@/lib/development/server/notifications";
import { safeQuery } from "@/lib/development/safe-query";
import {
  isNotificationsDryRun,
  isResendConfigured,
  isTwilioConfigured,
} from "@/lib/env";

export const metadata: Metadata = {
  title: "Notification rules · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NotificationsAdminPage() {
  // Stage 10.6.B.2-fix — wrap each query individually so a single
  // slow/failing loader doesn't 500 the whole page (Promise.all
  // rejects on first rejection).
  const [rules, templates, deliveryLog] = await Promise.all([
    safeQuery(
      "settings-notifications.getNotificationRules",
      getNotificationRules(),
      [] as Awaited<ReturnType<typeof getNotificationRules>>,
    ),
    safeQuery(
      "settings-notifications.getNotificationTemplates",
      getNotificationTemplates(),
      [] as Awaited<ReturnType<typeof getNotificationTemplates>>,
    ),
    safeQuery(
      "settings-notifications.getNotificationDeliveryLog",
      getNotificationDeliveryLog({ limit: 100 }),
      [] as Awaited<ReturnType<typeof getNotificationDeliveryLog>>,
    ),
  ]);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Settings</span> / <span>Notifications</span>
          </div>
          <h1>Notification rules</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Drives the notification dispatch cron. Each rule pairs a trigger
            event (milestone due, reservation expiring) with a recipient
            resolver, channel, and template. EMAIL_DRY_RUN=1 keeps every send
            local.
          </p>
        </div>
        <div className="actions">
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">Provider configuration</div>
        <p className="text-[13px] text-ink-3 mb-2.5 max-w-[680px]">
          Resend (transactional email) + Twilio (SMS / WhatsApp) are configured
          via env vars. Set NOTIFICATIONS_DRY_RUN=0 in production to enable live
          delivery.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <ProviderStatus
            name="Resend"
            envVars={["RESEND_API_KEY", "RESEND_FROM_EMAIL"]}
            configured={isResendConfigured()}
          />
          <ProviderStatus
            name="Twilio"
            envVars={["TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN", "TWILIO_FROM_SMS"]}
            configured={isTwilioConfigured()}
          />
          <div className="rounded-md border border-line-soft bg-surface p-4">
            <div className="text-[10px] uppercase tracking-widest text-ink-tertiary">
              Mode
            </div>
            <div className="mt-1">
              <HandoffBadge tone={isNotificationsDryRun() ? "warn" : "ok"}>
                {isNotificationsDryRun() ? "DRY RUN" : "LIVE"}
              </HandoffBadge>
            </div>
            <p className="text-xs text-ink-tertiary mt-2">
              Set <code>NOTIFICATIONS_DRY_RUN=0</code> to send real
              messages. Defaults to dry-run when unset.
            </p>
          </div>
        </div>
      </div>
      <NotificationRulesTabs
        rules={rules}
        templates={templates}
        deliveryLog={deliveryLog}
      />
    </DevelopmentShell>
  );
}

function ProviderStatus({
  name,
  envVars,
  configured,
}: {
  name: string;
  envVars: string[];
  configured: boolean;
}) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="font-medium text-sm">{name}</span>
        <HandoffBadge tone={configured ? "ok" : "soft"}>
          {configured ? "Configured" : "Not configured"}
        </HandoffBadge>
      </div>
      <div className="text-xs text-ink-tertiary space-y-1">
        <div>Required env:</div>
        <ul className="font-mono text-[11px]">
          {envVars.map((v) => (
            <li key={v}>{v}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
