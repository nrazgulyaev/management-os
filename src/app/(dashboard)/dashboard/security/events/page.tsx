import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Badge } from "@/components/ui/badge";
import { listSecurityEventsForAdmin } from "@/features/security-baseline/mfa-services";
import {
  eventTypeLabel,
  severityTone,
  type SecurityEventSeverity,
  type SecurityEventType,
} from "@/features/security-baseline/security-events-pure";
import { safeList } from "@/features/system/db-health";

export const metadata = { title: "Security events" };
export const dynamic = "force-dynamic";

export default async function SecurityEventsPage() {
  const events = await safeList("security.events", () =>
    listSecurityEventsForAdmin(200),
  );
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Security", href: "/dashboard/security" },
          { label: "Authentication", href: "/dashboard/security/auth" },
          { label: "Events" },
        ]}
        title="Security events"
        description="Append-only log of MFA enrolment, login throttling, suspicious requests, and job-lock activity."
      />
      {!events.ok && (
        <p className="rounded-md border border-warning/40 bg-warning-weak text-warning p-3 text-xs">
          {events.error?.kind === "missing_relation"
            ? "Migration pending — apply 0033_security_baseline_operational_hardening.sql."
            : `Could not load events: ${events.error?.message}`}
        </p>
      )}
      <Section eyebrow="Events" title={`${events.value.length} on file`}>
        <div className="rounded-md border border-line-soft bg-surface overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-canvas/50 text-left">
              <tr className="text-[11px] uppercase tracking-widest text-ink-tertiary">
                <th className="px-4 py-3">When</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Severity</th>
                <th className="px-4 py-3">User</th>
                <th className="px-4 py-3">IP hash</th>
                <th className="px-4 py-3">Metadata</th>
              </tr>
            </thead>
            <tbody>
              {events.value.map((e) => (
                <tr key={e.id} className="border-t border-line-soft">
                  <td className="px-4 py-3 font-mono tabular-nums text-xs">
                    {e.createdAt.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="px-4 py-3 text-xs">
                    {eventTypeLabel(e.eventType as SecurityEventType)}
                  </td>
                  <td className="px-4 py-3">
                    <Badge
                      tone={severityTone(e.severity as SecurityEventSeverity)}
                    >
                      {e.severity}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                    {e.appUserId ? `${e.appUserId.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="px-4 py-3 font-mono text-[11px] text-ink-tertiary">
                    {e.ipHash ? `${e.ipHash.slice(0, 8)}…` : "—"}
                  </td>
                  <td className="px-4 py-3 text-[11px] text-ink-tertiary truncate max-w-xs">
                    {summariseMetadata(e.metadata)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
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
