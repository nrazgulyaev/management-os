import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { MetricCard } from "@/components/ui/metric-card";
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

const BAND_TONE: Record<
  VendorScorecard["band"],
  "success" | "warning" | "danger"
> = {
  high: "success",
  mid: "warning",
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
        <Badge tone={BAND_TONE[card.band]}>{BAND_LABEL[card.band]}</Badge>
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
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Vendors" },
        ]}
        eyebrow={
          db
            ? `${list.length} vendors · ${metrics?.byStatus.active ?? 0} active`
            : "Database not configured"
        }
        title="Vendors & subcontractors"
        description="Construction vendors, subcontractors, suppliers, and consultants. Vendor performance (on-time + quality) is tracked across engagements; finance ledger commitments tie back to specific engagements."
        actions={
          <div className="flex items-center gap-2">
            <VendorModalForm />
            <Button asChild variant="secondary">
              <Link href="/development-os/vendors/new">Detailed form</Link>
            </Button>
            <ExportButton entity="vendors" />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      <FinanceTabs />

      {!db ? (
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      ) : (
        <>
          {metrics && (
            <Section eyebrow="Snapshot" title="At a glance">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <MetricCard
                  label="Total"
                  value={String(metrics.totalVendors)}
                  hint={`${metrics.byStatus.active} active`}
                />
                <MetricCard
                  label="Inactive / blacklisted"
                  value={String(
                    metrics.byStatus.inactive + metrics.byStatus.blacklisted,
                  )}
                />
                <MetricCard
                  label="Avg on-time"
                  value={
                    metrics.avgOnTimeDeliveryRate != null
                      ? `${metrics.avgOnTimeDeliveryRate.toFixed(1)}%`
                      : "—"
                  }
                />
                <MetricCard
                  label="Avg quality"
                  value={
                    metrics.avgQualityRating != null
                      ? `${metrics.avgQualityRating.toFixed(2)} / 5`
                      : "—"
                  }
                />
                <MetricCard
                  label="Avg AI score"
                  value={avgComposite != null ? `${avgComposite} / 100` : "—"}
                  hint={
                    scoredCards.length > 0
                      ? `${scoredCards.length} scored`
                      : "no signal yet"
                  }
                />
              </div>
            </Section>
          )}

          <Section eyebrow="All vendors" title="Active and inactive">
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
                        <Badge
                          tone={
                            v.status === "active"
                              ? "success"
                              : v.status === "blacklisted"
                                ? "danger"
                                : "neutral"
                          }
                        >
                          {VENDOR_STATUS_LABEL[v.status]}
                        </Badge>
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
          </Section>
        </>
      )}
    </DevelopmentShell>
  );
}
