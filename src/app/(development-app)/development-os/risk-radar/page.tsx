import type { Metadata } from "next";
import Link from "next/link";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listRecentAlerts } from "@/lib/development/server/risk-radar/risk-radar-queries";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Risk radar · Development OS" };
export const dynamic = "force-dynamic";

const SEVERITY_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  info: "info",
  low: "soft",
  medium: "info",
  high: "warn",
  critical: "danger",
};

const STATUS_TONE: Record<
  string,
  "info" | "ok" | "warn" | "danger" | "soft"
> = {
  open: "warn",
  acknowledged: "info",
  investigating: "info",
  resolved: "ok",
  false_positive: "soft",
  archived: "soft",
};

export default async function RiskRadarPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Risk radar</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const alerts = await safeQuery("listRecentAlerts", listRecentAlerts({ limit: 200 }), []);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Risk radar</span>
          </div>
          <h1>Risk radar</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            AI- and rule-based pattern detection. Operator review required for
            resolution.
          </p>
        </div>
      </div>
      <div>
        <div className="label mb-2.5">{`${alerts.length} alert${alerts.length === 1 ? "" : "s"}`}</div>
        {alerts.length === 0 ? (
          <EmptyState
            title="No alerts yet"
            description="The weekly risk-radar cron will populate this inbox. Run it manually from Jobs to seed data."
          
          action={
            <Link href="/dashboard/jobs" className="btn btn-secondary btn-sm">View jobs</Link>
          }
        />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Code</th>
                  <th scope="col">Severity</th>
                  <th scope="col">Category</th>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Detected</th>
                </tr>
              </thead>
              <tbody>
                {alerts.map((a) => (
                  <tr key={a.id}>
                    <td className="mono text-[12px]">
                      <Link href={`/development-os/risk-radar/${a.alertCode}`} className="hover:underline">
                        {a.alertCode}
                      </Link>
                    </td>
                    <td>
                      <HandoffBadge tone={SEVERITY_TONE[a.severity] ?? "soft"}>
                        {a.severity}
                      </HandoffBadge>
                    </td>
                    <td className="text-xs">{a.alertCategory}</td>
                    <td className="row-title truncate max-w-md">{a.title}</td>
                    <td>
                      <HandoffBadge tone={STATUS_TONE[a.status] ?? "soft"}>
                        {a.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-xs text-ink-3">
                      {new Date(a.detectedAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </DevelopmentShell>
  );
}
