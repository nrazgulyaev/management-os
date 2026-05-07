import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listConnectionsForUi } from "@/lib/marketing/queries";

export const metadata: Metadata = { title: "Connections · Marketing" };
export const dynamic = "force-dynamic";

export default async function MarketingConnectionsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Connections" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const connections = await listConnectionsForUi();

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing", href: "/development-os/marketing/dashboard" },
          { label: "Connections" },
        ]}
        eyebrow={`${connections.length} connections · ${connections.filter((c) => c.status === "active").length} active`}
        title="Marketing connections"
        description="Per-platform integration configuration. Credentials are encrypted at rest via STAY_LINK_KMS_SECRET. Sync cadence: 6h for campaigns, 3h for metrics, 1h for attribution."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/dashboard">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Marketing
            </Link>
          </Button>
        }
      />

      <Section title="Connections">
        {connections.length === 0 ? (
          <EmptyState
            title="No marketing connections yet"
            description="A connection-creation form will land alongside the operator-facing settings page in P5. For now connections are seeded via service-layer scripts."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Provider</TH>
                <TH>Account</TH>
                <TH>Status</TH>
                <TH>Last sync</TH>
                <TH>Result</TH>
                <TH className="text-right">Last sync rows</TH>
              </TR>
            </THead>
            <TBody>
              {connections.map((c) => (
                <TR key={c.id}>
                  <TD>
                    <Badge tone="outline">{c.provider}</Badge>
                  </TD>
                  <TD className="text-xs">
                    {c.accountName ?? c.externalAccountId}
                  </TD>
                  <TD>
                    <Badge
                      tone={
                        c.status === "active"
                          ? "success"
                          : c.status === "error"
                            ? "danger"
                            : "neutral"
                      }
                    >
                      {c.status}
                    </Badge>
                  </TD>
                  <TD className="text-xs text-ink-secondary">
                    {c.lastSyncedAt
                      ? new Date(c.lastSyncedAt)
                          .toISOString()
                          .slice(0, 16)
                          .replace("T", " ")
                      : "—"}
                  </TD>
                  <TD className="text-xs">{c.lastSyncStatus ?? "—"}</TD>
                  <TD className="text-right tabular-nums">
                    {c.lastSyncRecordsPulled ?? "—"}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
