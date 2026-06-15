import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { DbStatusNotice } from "@/components/admin/db-status";
import { TableEmpty } from "@/components/ui/table-empty";
import { ModalFirstAddButton } from "@/components/ui/primitives/modal-first-add-button";
import { SelfPreferenceForm } from "@/components/notifications/self-preference-form";
import { PreferenceForm } from "@/components/notifications/preference-form";
import { PreferenceEditButton } from "@/components/notifications/preference-edit-button";
import { listNotificationPreferences } from "@/features/notifications/services";
import { getCurrentUserContext, hasPermission } from "@/features/auth/permissions";

export const metadata = { title: "Notification preferences" };
export const dynamic = "force-dynamic";

export default async function NotificationPreferencesPage() {
  const rows = await listNotificationPreferences();
  const ctx = await getCurrentUserContext();
  const canManage = hasPermission(ctx, "notifications.manage");
  const enabledCount = rows.filter((p) => p.enabled).length;
  const quietHoursCount = rows.filter(
    (p) => p.quietHoursStart || p.quietHoursEnd,
  ).length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/notifications">Notifications</Link> /{" "}
            <span>Preferences</span>
          </div>
          <h1>Notification preferences</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Per-user / per-owner / per-role channel preferences. Quiet-hours
            support opt-out windows. Most-specific row wins (you &gt; owner
            &gt; role &gt; global).
          </p>
        </div>
        {canManage && (
          <div className="actions">
            <ModalFirstAddButton
              label="Add preference"
              modalTitle="Add preference"
              modalDescription="Configure a per-user, per-owner, per-role or global channel preference."
              formComponent={PreferenceForm}
            />
          </div>
        )}
      </div>

      <DbStatusNotice />

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-[18px]">
        <Kpi label="Preferences" value={String(rows.length)} sub="configured" />
        <Kpi
          label="Enabled"
          value={String(enabledCount)}
          tone={enabledCount > 0 ? "success" : undefined}
        />
        <Kpi
          label="With quiet hours"
          value={String(quietHoursCount)}
        />
      </div>

      <div className="card card-pad mb-[18px]">
        <div className="gs-card-h">
          <h3>Your preference</h3>
          <span className="meta">CHANNEL + QUIET HOURS</span>
        </div>
        <SelfPreferenceForm />
      </div>

      <Card padding="none" overflowHidden>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">Scope</th>
              <th scope="col">Channel</th>
              <th scope="col">Template</th>
              <th scope="col">Enabled</th>
              <th scope="col">Quiet hours</th>
              {canManage && (
                <th scope="col" className="text-right">
                  Actions
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <TableEmpty colSpan={canManage ? 6 : 5}>
                No preferences configured yet. Defaults apply: in-app channel
                always on, external channels off until Resend / Twilio env is
                set and dry-run is off.
              </TableEmpty>
            ) : (
              rows.map((p) => (
                <tr key={p.id}>
                  <td className="text-[12px]">
                    {p.appUserName ? (
                      <span>User · {p.appUserName}</span>
                    ) : p.ownerId ? (
                      <span>Owner · {p.ownerId.slice(0, 8)}</span>
                    ) : p.roleKey ? (
                      <span>Role · {p.roleKey}</span>
                    ) : (
                      <span className="text-ink-4">Global</span>
                    )}
                  </td>
                  <td>
                    <span className="badge">{p.channel}</span>
                  </td>
                  <td className="mono text-[11px]">{p.templateKey}</td>
                  <td>
                    <span
                      className={`badge ${p.enabled ? "badge-ok" : "badge-soft"}`}
                    >
                      {p.enabled ? "on" : "off"}
                    </span>
                  </td>
                  <td className="mono text-[11px] text-ink-3">
                    {p.quietHoursStart || p.quietHoursEnd
                      ? `${p.quietHoursStart ?? "—"} → ${p.quietHoursEnd ?? "—"}`
                      : "—"}
                  </td>
                  {canManage && (
                    <td className="text-right">
                      <PreferenceEditButton
                        row={{
                          id: p.id,
                          appUserId: p.appUserId,
                          ownerId: p.ownerId,
                          roleKey: p.roleKey,
                          channel: p.channel,
                          templateKey: p.templateKey,
                          enabled: p.enabled,
                          quietHoursStart: p.quietHoursStart,
                          quietHoursEnd: p.quietHoursEnd,
                        }}
                      />
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}
