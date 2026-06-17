import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { Card, HandoffBadge } from "@/components/dashboard/primitives";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getCorporateEvents,
  getCorporateEventsSummary,
} from "@/lib/development/server/corporate-events";
import { listOrgContacts } from "@/lib/development/server/contacts";
import { formatUsdMinor } from "@/lib/development/constants/investor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import {
  NewCorporateEventButton,
  CorporateEventRowActions,
} from "./_controls";

export const metadata: Metadata = { title: "Corporate events · Development OS" };
export const dynamic = "force-dynamic";

export default async function CorporateEventsPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <div className="page-header">
          <div className="left">
            <h1>Corporate events</h1>
          </div>
        </div>
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const [events, summary, contacts] = await Promise.all([
    safeQuery("getCorporateEvents", getCorporateEvents(), [], 4000),
    safeQuery(
      "getCorporateEventsSummary",
      getCorporateEventsSummary(),
      { byType: {}, totalUsdMinor: "0" },
      4000,
    ),
    safeQuery("listOrgContacts", listOrgContacts(), [], 4000),
  ]);

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <Link href="/development-os/finance">Finance</Link> /{" "}
            <span>Corporate events</span>
          </div>
          <h1>Corporate events</h1>
          <div className="label mt-2">
            {`${events.length} events · ${formatUsdMinor(BigInt(summary.totalUsdMinor))} total`}
          </div>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Director loans, dividends, share transfers — the owner-side flows.
            Excluded from the Self-Sustaining Threshold cash-flow calculation.
          </p>
        </div>
        <div className="actions">
          <NewCorporateEventButton contacts={contacts} />
          <Link href="/development-os/finance" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Finance
          </Link>
        </div>
      </div>

      {Object.keys(summary.byType).length > 0 && (
        <div>
          <div className="label mb-2.5">Summary</div>
          <Card padding="default">
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
          </Card>
        </div>
      )}

      <div>
        <div className="label mb-2.5">Events</div>
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
                <TH>Actions</TH>
              </TR>
            </THead>
            <TBody>
              {events.map((e) => (
                <TR key={e.id}>
                  <TD className="font-mono text-xs">{e.eventCode}</TD>
                  <TD>
                    <HandoffBadge tone="soft">{e.eventType.replace(/_/g, " ")}</HandoffBadge>
                  </TD>
                  <TD className="text-xs">{String(e.eventDate)}</TD>
                  <TDNum>{formatUsdMinor(BigInt(e.amountUsdMinor))}</TDNum>
                  <TD className="text-xs">{e.description}</TD>
                  <TD>
                    <CorporateEventRowActions
                      contacts={contacts}
                      event={{
                        id: e.id,
                        eventCode: e.eventCode,
                        eventType: e.eventType,
                        relatedContactId: e.relatedContactId ?? null,
                        amountCurrency: e.amountCurrency,
                        amountOriginalMinor: String(e.amountOriginalMinor),
                        fxRate: String(e.fxRate),
                        eventDate: String(e.eventDate),
                        description: e.description,
                        notes: e.notes ?? null,
                      }}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </div>
    </DevelopmentShell>
  );
}
