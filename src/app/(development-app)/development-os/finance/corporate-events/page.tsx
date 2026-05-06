import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getCorporateEvents,
  getCorporateEventsSummary,
} from "@/lib/development/server/corporate-events";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";

export const metadata: Metadata = { title: "Corporate events · Development OS" };
export const dynamic = "force-dynamic";

export default async function CorporateEventsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Corporate events" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const [events, summary] = await Promise.all([
    safeQuery("getCorporateEvents", getCorporateEvents(), [], 4000),
    safeQuery(
      "getCorporateEventsSummary",
      getCorporateEventsSummary(),
      { byType: {}, totalUsdMinor: "0" },
      4000,
    ),
  ]);

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Finance", href: "/development-os/finance" },
          { label: "Corporate events" },
        ]}
        eyebrow={`${events.length} events · ${formatUsdMinor(BigInt(summary.totalUsdMinor))} total`}
        title="Corporate events"
        description="Director loans, dividends, share transfers — the owner-side flows. Excluded from the Self-Sustaining Threshold cash-flow calculation."
        actions={
          <Button asChild variant="secondary">
            <Link href="/development-os/finance">
              <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
              Finance
            </Link>
          </Button>
        }
      />

      {Object.keys(summary.byType).length > 0 && (
        <Section eyebrow="Summary" title="By type">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {Object.entries(summary.byType).map(([type, data]) => (
              <div
                key={type}
                className="rounded-lg border border-line-soft bg-surface p-4"
              >
                <div className="text-[11px] uppercase tracking-wide text-ink-tertiary">
                  {type.replace(/_/g, " ")}
                </div>
                <div className="text-xl font-medium tabular-nums">
                  {formatUsdMinor(BigInt(data.totalUsdMinor))}
                </div>
                <div className="text-xs text-ink-tertiary">{data.count} events</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      <Section eyebrow="Events" title="Chronological">
        {events.length === 0 ? (
          <EmptyState
            title="No corporate events"
            description="Use the recordCorporateEvent action to add the first."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Code</TH>
                <TH>Type</TH>
                <TH>Date</TH>
                <TH>Amount (USD)</TH>
                <TH>Description</TH>
              </TR>
            </THead>
            <TBody>
              {events.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs">{e.eventCode}</TD>
                  <TD>
                    <Badge tone="neutral">{e.eventType.replace(/_/g, " ")}</Badge>
                  </TD>
                  <TD className="text-xs">{String(e.eventDate)}</TD>
                  <TDNum>{formatUsdMinor(BigInt(e.amountUsdMinor))}</TDNum>
                  <TD className="text-xs">{e.description}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}
