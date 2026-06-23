import Link from "next/link";
import { Card, Kpi } from "@/components/dashboard/primitives";
import { Badge } from "@/components/ui/badge";
import { TableEmpty } from "@/components/ui/table-empty";
import { listSecurityEventsForAdmin } from "@/features/security-baseline/mfa-services";
import {
  eventTypeLabel,
  severityTone,
  type SecurityEventSeverity,
  type SecurityEventType,
} from "@/features/security-baseline/security-events-pure";
import { safeList } from "@/features/system/db-health";
import { requireCabinetAccess } from "@/features/keystone/access";
import { CabinetGate } from "@/components/keystone/cabinet-gate";

export const metadata = { title: "Security events" };
export const dynamic = "force-dynamic";

export default async function SecurityEventsPage() {
  const { allowed } = await requireCabinetAccess("security");
  if (!allowed) return <CabinetGate cabinet="Security" />;
  const events = await safeList("security.events", () =>
    listSecurityEventsForAdmin(200),
  );
  const criticalCount = events.value.filter(
    (e) => e.severity === "critical" || e.severity === "high",
  ).length;
  const warningCount = events.value.filter(
    (e) => e.severity === "warning" || e.severity === "medium",
  ).length;
  const infoCount = events.value.filter((e) => e.severity === "info").length;
  return (
    <>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/security">Security</Link> /{" "}
            <Link href="/dashboard/security/auth">Authentication</Link> /{" "}
            <span>Events</span>
          </div>
          <h1>Security events</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[760px]">
            Append-only log of MFA enrolment, login throttling, suspicious
            requests, and job-lock activity.
          </p>
        </div>
        <div className="actions">
          <span className="mono text-[11px] text-ink-3">
            {events.value.length} on file
          </span>
        </div>
      </div>

      {!events.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs mb-[18px]">
          {events.error?.kind === "missing_relation"
            ? "Migration pending — apply 0033_security_baseline_operational_hardening.sql."
            : `Could not load events: ${events.error?.message}`}
        </p>
      )}

      <div className="gs-kpis">
        <Kpi label="Events" value={String(events.value.length)} sub="on file" />
        <Kpi
          label="Critical / high"
          value={String(criticalCount)}
          tone={criticalCount > 0 ? "danger" : undefined}
        />
        <Kpi
          label="Warning / medium"
          value={String(warningCount)}
          tone={warningCount > 0 ? "warn" : undefined}
        />
        <Kpi label="Info" value={String(infoCount)} />
      </div>

      <Card padding="none" overflowHidden>
        <table className="data">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Type</th>
              <th scope="col">Severity</th>
              <th scope="col">User</th>
              <th scope="col">IP hash</th>
              <th scope="col">Metadata</th>
            </tr>
          </thead>
          <tbody>
            {events.value.length === 0 ? (
              <TableEmpty colSpan={6}>No security events on file.</TableEmpty>
            ) : (
              events.value.map((e) => (
                <tr key={e.id}>
                  <td className="mono text-[11px] text-ink-3 tabular-nums whitespace-nowrap">
                    {e.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="text-[12px]">
                    {eventTypeLabel(e.eventType as SecurityEventType)}
                  </td>
                  <td>
                    <Badge
                      tone={severityTone(e.severity as SecurityEventSeverity)}
                    >
                      {e.severity}
                    </Badge>
                  </td>
                  <td className="mono text-[11px] text-ink-4">
                    {e.appUserId ? `${e.appUserId.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="mono text-[11px] text-ink-4">
                    {e.ipHash ? `${e.ipHash.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="text-[11px] text-ink-4 truncate max-w-xs">
                    {summariseMetadata(e.metadata)}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function summariseMetadata(meta: unknown): string {
  if (!meta || typeof meta !== "object") return "";
  return Object.entries(meta as Record<string, unknown>)
    .filter(([k]) => !["password", "secret", "secretCiphertext"].includes(k))
    .slice(0, 4)
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" · ");
}
