import { PageHeader } from "@/components/ui/page-header";
import { DbStatusNotice } from "@/components/admin/db-status";
import { Badge } from "@/components/ui/badge";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { listNotificationPreferences } from "@/features/notifications/services";

export const metadata = { title: "Notification preferences" };
export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  const rows = await listNotificationPreferences();
  return (
    <div className="flex flex-col gap-8">
      <PageHeader
        breadcrumbs={[
          { label: "Notifications", href: "/dashboard/notifications" },
          { label: "Preferences" },
        ]}
        title="Notification preferences"
        description="Per-user, per-owner, or per-role channel preferences. Quiet-hours support opt-out windows. Editor UI ships in v8 alongside the email/SMS providers."
      />
      <DbStatusNotice />
      {rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
          No preferences configured yet. Defaults apply: in-app channel always on, external
          channels off until v8.
        </p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>Scope</TH>
              <TH>Channel</TH>
              <TH>Template</TH>
              <TH>Enabled</TH>
              <TH>Quiet hours</TH>
            </TR>
          </THead>
          <TBody>
            {rows.map((p) => (
              <TR key={p.id}>
                <TD className="text-sm">
                  {p.appUserName ? (
                    <span>User · {p.appUserName}</span>
                  ) : p.ownerId ? (
                    <span>Owner · {p.ownerId.slice(0, 8)}</span>
                  ) : p.roleKey ? (
                    <span>Role · {p.roleKey}</span>
                  ) : (
                    <span className="text-ink-tertiary">Global</span>
                  )}
                </TD>
                <TD>
                  <Badge tone="outline">{p.channel}</Badge>
                </TD>
                <TD className="font-mono text-xs">{p.templateKey}</TD>
                <TD>
                  <Badge tone={p.enabled ? "success" : "neutral"}>
                    {p.enabled ? "on" : "off"}
                  </Badge>
                </TD>
                <TD className="text-xs">
                  {p.quietHoursStart || p.quietHoursEnd
                    ? `${p.quietHoursStart ?? "—"} → ${p.quietHoursEnd ?? "—"}`
                    : "—"}
                </TD>
              </TR>
            ))}
          </TBody>
        </Table>
      )}
    </div>
  );
}
