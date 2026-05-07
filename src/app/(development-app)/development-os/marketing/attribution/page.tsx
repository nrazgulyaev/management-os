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
import { listConversionsForUi } from "@/lib/marketing/queries";

export const metadata: Metadata = { title: "Attribution · Marketing" };
export const dynamic = "force-dynamic";

export default async function AttributionPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Attribution" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }
  const conversions = await listConversionsForUi({ limit: 200 });
  const totalConversions = conversions.length;
  const attributed = conversions.filter((c) => c.linearAttributionData != null).length;
  const totalRevenueMinor = conversions.reduce<bigint>(
    (acc, c) => acc + BigInt(c.conversionValueMinor ?? 0n),
    0n,
  );

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Marketing", href: "/development-os/marketing/dashboard" },
          { label: "Attribution" },
        ]}
        eyebrow={`${totalConversions} conversions · ${attributed} attributed · ${formatMoney(totalRevenueMinor, "USD")} total revenue`}
        title="Attribution dashboard"
        description="Multi-touch attribution computed by the hourly engine cron. Default model: last_touch (operator override per-org via service layer). Conversion → touchpoint matching by contact_id when available, else client_id."
        actions={
          <div className="flex items-center gap-2">
            <Button asChild variant="secondary">
              <Link href="/development-os/marketing/dashboard">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Marketing
              </Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/marketing/conversions">Conversions</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/development-os/marketing/connections">Connections</Link>
            </Button>
          </div>
        }
      />

      <Section
        title="Recent attributed conversions"
        description="Showing the 200 most-recent. Per-campaign credit lives in `attribution_conversions.linear_attribution_data` (JSONB)."
      >
        {conversions.length === 0 ? (
          <EmptyState
            title="No conversions yet"
            description="Conversions land here when the system records a reservation/lead/deal and the attribution cron processes them."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Type</TH>
                <TH>Value</TH>
                <TH>First-touch campaign</TH>
                <TH>Last-touch campaign</TH>
                <TH className="text-right">Touchpoints</TH>
                <TH className="text-right">Days to convert</TH>
              </TR>
            </THead>
            <TBody>
              {conversions.map((c) => (
                <TR key={c.id}>
                  <TD className="text-xs">
                    {new Date(c.convertedAt).toISOString().slice(0, 16).replace("T", " ")}
                  </TD>
                  <TD>
                    <Badge tone="outline">{c.conversionType}</Badge>
                  </TD>
                  <TD className="text-right tabular-nums">
                    {c.conversionValueMinor
                      ? formatMoney(BigInt(c.conversionValueMinor), c.conversionCurrency ?? "USD")
                      : "—"}
                  </TD>
                  <TD className="font-mono text-[11px]">
                    {c.firstTouchCampaignId ? c.firstTouchCampaignId.slice(0, 8) : "—"}
                  </TD>
                  <TD className="font-mono text-[11px]">
                    {c.lastTouchCampaignId ? c.lastTouchCampaignId.slice(0, 8) : "—"}
                  </TD>
                  <TD className="text-right tabular-nums">{c.touchpointCount ?? "—"}</TD>
                  <TD className="text-right tabular-nums">{c.daysToConvert ?? "—"}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>
    </DevelopmentShell>
  );
}

function formatMoney(amount: bigint, currency: string): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const major = (abs / 100n).toString();
  const minor = (abs % 100n).toString().padStart(2, "0");
  return `${negative ? "-" : ""}${major}.${minor} ${currency}`;
}
