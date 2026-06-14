import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { HandoffBadge } from "@/components/dashboard/primitives";
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
        <div className="page-header">
          <div className="left">
            <h1>Conversions</h1>
          </div>
        </div>
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/marketing/dashboard">Marketing</Link> /{" "}
            <span>Conversions</span>
          </div>
          <h1>Conversions</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Every recorded conversion event with its source touchpoint trail.
            Touchpoints (UTM-tagged + referrer) are ingested via the JS Tag
            client; conversions are recorded server-side when a
            reservation/lead/deal lands.
          </p>
        </div>
        <div className="actions">
          <Link
            href="/development-os/marketing/dashboard"
            className="btn btn-secondary btn-sm"
          >
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Marketing
          </Link>
        </div>
      </div>

      <div>
        <div className="label mb-2.5">By type</div>
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
                    <HandoffBadge tone="soft">{type}</HandoffBadge>
                  </TD>
                  <TD className="text-right tabular-nums">{count}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>

      <div>
        <div className="label mb-2.5">Recent touchpoints</div>
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
                    <HandoffBadge tone="soft">{t.channel}</HandoffBadge>
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
      </div>
    </DevelopmentShell>
  );
}
