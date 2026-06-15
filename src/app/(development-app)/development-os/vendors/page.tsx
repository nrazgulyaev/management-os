import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Kpi, Card, HandoffBadge } from "@/components/dashboard/primitives";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import {
  getVendors,
  getVendorMetrics,
} from "@/lib/development/server/vendors";
import {
  VENDOR_TYPE_LABEL,
  VENDOR_STATUS_LABEL,
} from "@/lib/development/constants/vendor-constants";
import { safeQuery } from "@/lib/development/safe-query";
import { FinanceTabs } from "@/components/development/finance/finance-tabs";
import { VendorModalForm } from "@/components/development/finance/vendor-modal-form";
import { ExportButton } from "@/components/development/bulk-import/export-button";
import { DevOsRowActions } from "@/components/development/dev-os-row-actions";
import { NoItemsYet } from "@/components/ui/primitives";
import {
  loadVendorScorecards,
  type VendorScorecard,
} from "./_vendor-scorecard";

export const metadata: Metadata = { title: "Vendors · Development OS" };
export const dynamic = "force-dynamic";

const BAND_TONE: Record<VendorScorecard["band"], "ok" | "warn" | "danger"> = {
  high: "ok",
  mid: "warn",
  low: "danger",
};

const BAND_LABEL: Record<VendorScorecard["band"], string> = {
  high: "Preferred",
  mid: "Standard",
  low: "Watch",
};

/** Renders a 0–100 / star vendor scorecard cell. */
function VendorScoreCell({ card }: { card: VendorScorecard | undefined }) {
  if (!card) {
    return <span className="text-ink-tertiary text-xs">—</span>;
  }
  const fullStars = Math.floor(card.stars);
  const half = card.stars - fullStars >= 0.5;
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <span
          className="font-mono text-sm tabular-nums"
          aria-label={`Composite score ${card.composite} out of 100`}
        >
          {card.composite}
        </span>
        <HandoffBadge tone={BAND_TONE[card.band]}>
          {BAND_LABEL[card.band]}
        </HandoffBadge>
      </div>
      <div
        className="text-[13px] leading-none text-amber"
        title={`${card.stars.toFixed(1)} / 5 · ${card.persisted ? "nightly score" : "computed live"}`}
        aria-hidden
      >
        {"★".repeat(fullStars)}
        {half ? "⯨" : ""}
        <span className="text-line-soft">
          {"☆".repeat(5 - fullStars - (half ? 1 : 0))}
        </span>
      </div>
    </div>
  );
}

export default async function VendorsPage() {
  const db = getDb();
  const [list, metrics, scorecards] = db
    ? await Promise.all([
        safeQuery("getVendors", getVendors(), [], 4000),
        safeQuery(
          "getVendorMetrics",
          getVendorMetrics(),
          {
            totalVendors: 0,
            byStatus: { active: 0, inactive: 0, blacklisted: 0 } as Record<
              "active" | "inactive" | "blacklisted",
              number
            >,
            totalCommitmentsValueUsdMinor: "0",
            avgOnTimeDeliveryRate: null,
            avgQualityRating: null,
          },
          4000,
        ),
        safeQuery(
          "loadVendorScorecards",
          loadVendorScorecards(),
          new Map<string, VendorScorecard>(),
          4000,
        ),
      ])
    : [[], null, new Map<string, VendorScorecard>()];

  // Average AI composite across vendors that have a score, for the snapshot.
  const scoredCards = Array.from(scorecards.values());
  const avgComposite =
    scoredCards.length > 0
      ? Math.round(
          scoredCards.reduce((s, c) => s + c.composite, 0) / scoredCards.length,
        )
      : null;

  return (
    <DevelopmentShell>
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/development-os">Development OS</Link> /{" "}
            <span>Vendors</span>
            {" · "}
            {db
              ? `${list.length} vendors · ${metrics?.byStatus.active ?? 0} active`
              : "Database not configured"}
          </div>
          <h1>Vendors &amp; subcontractors</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Construction vendors, subcontractors, suppliers, and consultants.
            Vendor performance (on-time + quality) is tracked across
            engagements; finance ledger commitments tie back to specific
            engagements.
          </p>
        </div>
        <div className="actions">
          <VendorModalForm />
          <Link
            href="/development-os/vendors/new"
            className="btn btn-secondary btn-sm"
          >
            Detailed form
          </Link>
          <ExportButton entity="vendors" />
          <Link href="/development-os" className="btn btn-secondary btn-sm">
            <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
            Command center
          </Link>
        </div>
      </div>

      <FinanceTabs />

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : (
        <>
          {metrics && (
            <div>
              <div className="label mb-2.5">Snapshot</div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Kpi
                  label="Total"
                  value={String(metrics.totalVendors)}
                  sub={`${metrics.byStatus.active} active`}
                />
                <Kpi
                  label="Inactive / blacklisted"
                  value={String(
                    metrics.byStatus.inactive + metrics.byStatus.blacklisted,
                  )}
                />
                <Kpi
                  label="Avg on-time"
                  value={
                    metrics.avgOnTimeDeliveryRate != null
                      ? `${metrics.avgOnTimeDeliveryRate.toFixed(1)}%`
                      : "—"
                  }
                />
                <Kpi
                  label="Avg quality"
                  value={
                    metrics.avgQualityRating != null
                      ? `${metrics.avgQualityRating.toFixed(2)} / 5`
                      : "—"
                  }
                />
                <Kpi
                  label="Avg AI score"
                  value={avgComposite != null ? `${avgComposite} / 100` : "—"}
                  sub={
                    scoredCards.length > 0
                      ? `${scoredCards.length} scored`
                      : "no signal yet"
                  }
                />
              </div>
            </div>
          )}

          <div>
            <div className="label mb-2.5">All vendors</div>
            {list.length === 0 ? (
              <NoItemsYet
                entityLabel="vendors"
                description="Add your first vendor to start tracking POs and deliveries."
              />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>Code</TH>
                    <TH>Legal name</TH>
                    <TH>Type</TH>
                    <TH>Email</TH>
                    <TH>Active eng.</TH>
                    <TH>On-time</TH>
                    <TH>Quality</TH>
                    <TH>AI score</TH>
                    <TH>Status</TH>
                    <TH />
                  </TR>
                </THead>
                <TBody>
                  {list.map((v) => (
                    <TR key={v.id}>
                      <TD className="font-mono text-xs">
                        <Link
                          href={`/development-os/vendors/${v.vendorCode}`}
                          className="hover:underline"
                        >
                          {v.vendorCode}
                        </Link>
                      </TD>
                      <TD className="font-medium">{v.legalName}</TD>
                      <TD className="text-xs text-ink-secondary">
                        {VENDOR_TYPE_LABEL[v.vendorType]}
                      </TD>
                      <TD className="text-xs">{v.primaryEmail ?? "—"}</TD>
                      <TDNum>{v.activeEngagementCount}</TDNum>
                      <TDNum>
                        {v.onTimeDeliveryRate
                          ? `${Number(v.onTimeDeliveryRate).toFixed(1)}%`
                          : "—"}
                      </TDNum>
                      <TDNum>
                        {v.qualityRating
                          ? `${Number(v.qualityRating).toFixed(2)} / 5`
                          : "—"}
                      </TDNum>
                      <TD>
                        <VendorScoreCell card={scorecards.get(v.id)} />
                      </TD>
                      <TD>
                        <HandoffBadge
                          tone={
                            v.status === "active"
                              ? "ok"
                              : v.status === "blacklisted"
                                ? "danger"
                                : "soft"
                          }
                        >
                          {VENDOR_STATUS_LABEL[v.status]}
                        </HandoffBadge>
                      </TD>
                      <TD className="text-right">
                        <DevOsRowActions
                          kind="vendor"
                          row={{
                            id: v.id,
                            displayName: v.legalName,
                            detailHref: `/development-os/vendors/${v.vendorCode}`,
                            values: {
                              vendorCode: v.vendorCode,
                              legalName: v.legalName,
                              vendorType: v.vendorType,
                              primaryEmail: v.primaryEmail ?? "",
                              primaryPhone: v.primaryPhone ?? "",
                              whatsappPhone: v.whatsappPhone ?? "",
                            },
                          }}
                        />
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </div>
        </>
      )}
    </DevelopmentShell>
  );
}
