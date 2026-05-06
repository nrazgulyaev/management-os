import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listRecentAlerts } from "@/lib/development/server/risk-radar/risk-radar-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Risk radar · Development OS" };
export const dynamic = "force-dynamic";

const SEVERITY_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  info: "info",
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

const STATUS_TONE: Record<
  string,
  "info" | "success" | "warning" | "danger" | "neutral"
> = {
  open: "warning",
  acknowledged: "info",
  investigating: "info",
  resolved: "success",
  false_positive: "neutral",
  archived: "neutral",
};

export default async function RiskRadarPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Risk radar" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const alerts = await safeQuery("listRecentAlerts", listRecentAlerts({ limit: 200 }), []);

  return (
    <DevelopmentShell>
      <PageHeader
        title="Risk radar"
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Risk radar" },
        ]}
        description="AI- and rule-based pattern detection. Operator review required for resolution."
      />
      <Section title={`${alerts.length} alert${alerts.length === 1 ? "" : "s"}`}>
        {alerts.length === 0 ? (
          <EmptyState
            title="No alerts yet"
            description="The weekly risk-radar cron will populate this inbox. Run it manually from Jobs to seed data."
          />
        ) : (
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="text-left text-ink-tertiary border-b border-line-soft">
                <th className="py-2">Code</th>
                <th>Severity</th>
                <th>Category</th>
                <th>Title</th>
                <th>Status</th>
                <th>Detected</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id} className="border-b border-line-soft hover:bg-muted/30">
                  <td className="py-2 font-mono text-xs">
                    <Link href={`/development-os/risk-radar/${a.alertCode}`} className="hover:underline">
                      {a.alertCode}
                    </Link>
                  </td>
                  <td>
                    <Badge tone={SEVERITY_TONE[a.severity] ?? "neutral"}>
                      {a.severity}
                    </Badge>
                  </td>
                  <td className="text-xs">{a.alertCategory}</td>
                  <td className="truncate max-w-md">{a.title}</td>
                  <td>
                    <Badge tone={STATUS_TONE[a.status] ?? "neutral"}>
                      {a.status}
                    </Badge>
                  </td>
                  <td className="text-xs text-ink-tertiary">
                    {new Date(a.detectedAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
