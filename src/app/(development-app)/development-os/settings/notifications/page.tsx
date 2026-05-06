import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DevelopmentShell } from "@/components/development/development-shell";
import { NotificationRulesTabs } from "@/components/development/notifications/notification-rules-tabs";
import {
  getNotificationDeliveryLog,
  getNotificationRules,
  getNotificationTemplates,
} from "@/lib/development/server/notifications";

export const metadata: Metadata = {
  title: "Notification rules · Development OS",
};
export const dynamic = "force-dynamic";

export default async function NotificationsAdminPage() {
  const [rules, templates, deliveryLog] = await Promise.all([
    getNotificationRules(),
    getNotificationTemplates(),
    getNotificationDeliveryLog({ limit: 100 }),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Settings" },
          { label: "Notifications" },
        ]}
        eyebrow={`${rules.filter((r) => r.isActive).length} active rules · ${deliveryLog.length} recent deliveries`}
        title="Notification rules"
        description="Drives the notification dispatch cron. Each rule pairs a trigger event (milestone due, reservation expiring) with a recipient resolver, channel, and template. EMAIL_DRY_RUN=1 keeps every send local."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Command center
            </Link>
          </Button>
        }
      />
      <NotificationRulesTabs
        rules={rules}
        templates={templates}
        deliveryLog={deliveryLog}
      />
    </DevelopmentShell>
  );
}
