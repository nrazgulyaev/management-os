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
import {
  listConversionsForUi,
  listRecentTouchpointsForUi,
} from "@/lib/marketing/queries";

export const metadata: Metadata = { title: "Conversions · Marketing" };
export const dynamic = "force-dynamic";

export default async function ConversionsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Conversions" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const [conversions, touchpoints] = await Promise.all([
    listConversionsForUi({ limit: 200 }),
    listRecentTouchpointsForUi({ limit: 200 }),
  ]);

  const byType = new Map<string, number>();
  for (const c of conversions) {
    byType.set(c.conversionType, (byType.get(c.conversionType) ?? 0) + 1);
  }

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing", href: "/development-os/marketing/dashboard" },
          { label: "Conversions" },
        ]}
        eyebrow={`${conversions.length} conversions · ${touchpoints.length} recent touchpoints`}
        title="Conversions"
        description="Every recorded conversion event with its source touchpoint trail. Touchpoints (UTM-tagged + referrer) are ingested via the JS Tag client; conversions are recorded server-side when a reservation/lead/deal lands."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/marketing/dashboard">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Marketing
            </Link>
          </Button>
        }
      />

      <Section title="By type">
        {byType.size === 0 ? (
          <EmptyState title="No conversions yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Conversion type</TH>
                <TH className="text-right">Count</TH>
              </TR>
            </THead>
            <TBody>
              {Array.from(byType.entries()).map(([type, count]) => (
                <TR key={type}>
                  <TD>
                    <Badge tone="outline">{type}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">{count}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      <Section title="Recent touchpoints" description="Latest 200 inbound touchpoints. Channel is classified at ingest time via the UTM tracker.">
        {touchpoints.length === 0 ? (
          <EmptyState title="No touchpoints yet" />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Channel</TH>
                <TH>Source</TH>
                <TH>Medium</TH>
                <TH>Campaign</TH>
                <TH>Landing URL</TH>
              </TR>
            </THead>
            <TBody>
              {touchpoints.map((t) => (
                <TR key={t.id}>
                  <TD className="text-xs">
                    {new Date(t.touchpointAt).toISOString().slice(0, 16).replace("T", " ")}
                  </TD>
                  <TD>
                    <Badge tone="outline">{t.channel}</Badge>
                  </TD>
                  <TD className="text-xs">{t.source ?? "—"}</TD>
                  <TD className="text-xs">{t.medium ?? "—"}</TD>
                  <TD className="text-xs">{t.campaign ?? "—"}</TD>
                  <TD className="text-xs truncate max-w-xs">{t.landingUrl ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
