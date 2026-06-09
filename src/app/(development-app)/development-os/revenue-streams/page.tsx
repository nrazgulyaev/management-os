import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, FileSignature } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Section } from "@/components/ui/section";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { MetricCard } from "@/components/ui/metric-card";
import { Table, THead, TBody, TR, TH, TD, TDNum } from "@/components/ui/table";
import { DevelopmentShell } from "@/components/development/development-shell";
import { getDb } from "@/lib/db/client";
import { listRevenueStreams } from "@/lib/development/server/revenue-streams/revenue-stream-queries";
import {
  getRevenueRecognitionView,
  type RecognitionView,
} from "@/lib/development/server/revenue-streams/revenue-recognition-queries";
import { listAssets } from "@/lib/development/server/assets/asset-queries";
import { safeQuery } from "@/lib/development/safe-query";
import { LogRevenueStreamForm } from "./_create-form";

export const metadata: Metadata = { title: "Revenue recognition · Development OS" };
export const dynamic = "force-dynamic";

const EMPTY_VIEW: RecognitionView = {
  projects: [],
  totals: {
    salesRecognisedUsdMinor: 0n,
    salesDeferredUsdMinor: 0n,
    streamRecognisedMinor: 0n,
    streamDeferredMinor: 0n,
    streamCurrency: "IDR",
    contractsTransferred: 0,
    contractsPending: 0,
  },
  nextUnlock: null,
};

function formatMoney(minor: bigint, currency: string) {
  const n = Number(minor) / 100;
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 0 })} ${currency}`;
}

/** Compact USD label (e.g. "1.2M USD") for the KPI strip. */
function formatUsdCompact(minor: bigint) {
  const n = Number(minor) / 100;
  const compact = n.toLocaleString(undefined, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  return `${compact} USD`;
}

function pct(part: bigint, whole: bigint): number {
  if (whole <= 0n) return 0;
  return Math.max(0, Math.min(100, Number((part * 10000n) / whole) / 100));
}

/** Recognised (accent) vs deferred (muted) split bar. */
function MixBar({
  recognised,
  deferred,
}: {
  recognised: bigint;
  deferred: bigint;
}) {
  const total = recognised + deferred;
  const recPct = pct(recognised, total);
  return (
    <div className="flex flex-col gap-1 min-w-[140px]">
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden flex">
        <div
          className="h-full bg-accent"
          style={{ width: `${recPct}%` }}
          aria-hidden
        />
      </div>
      <span className="text-[11px] text-ink-tertiary tabular-nums">
        {recPct.toFixed(0)}% recognised
      </span>
    </div>
  );
}

export default async function RevenueRecognitionPage() {
  const db = getDb();
  if (!db) {
    return (
      <DevelopmentShell>
        <PageHeader title="Revenue recognition" />
        <EmptyState title="Database not configured" description="Set DATABASE_URL." />
      </DevelopmentShell>
    );
  }

  const [view, streams, assetRows] = await Promise.all([
    safeQuery("getRevenueRecognitionView", getRevenueRecognitionView(), EMPTY_VIEW, 6000),
    safeQuery("listRevenueStreams", listRevenueStreams(), [], 4000),
    safeQuery("listAssets", listAssets(), [], 4000),
  ]);

  const assetOpts = assetRows.map((a) => ({
    id: a.id,
    projectId: a.projectId,
    label: `${a.unitCode} · ${a.name}`,
  }));

  const { totals, projects, nextUnlock } = view;
  const salesTotal = totals.salesRecognisedUsdMinor + totals.salesDeferredUsdMinor;
  const salesRecPct = pct(totals.salesRecognisedUsdMinor, salesTotal);
  const streamTotal = totals.streamRecognisedMinor + totals.streamDeferredMinor;
  const cur = totals.streamCurrency;

  const hasData = projects.length > 0;

  return (
    <DevelopmentShell>
      <PageHeader
        breadcrumbs={[
          { label: "Development OS", href: "/development-os" },
          { label: "Revenue recognition" },
        ]}
        eyebrow={`${totals.contractsTransferred + totals.contractsPending} contracts · ${streams.length} stream logs`}
        title="Revenue recognition"
        description="Recognised vs deferred revenue across the portfolio. Sale revenue is recognised at the AJB (Akta Jual Beli — the notarial deed transferring title); cash collected before transfer is a deferred contract liability. Operating-stream revenue is recognised once each period has closed."
        actions={
          <div className="flex items-center gap-2">
            <LogRevenueStreamForm assets={assetOpts} />
            <Button asChild variant="secondary">
              <Link href="/development-os">
                <ArrowLeft className="w-4 h-4" strokeWidth={1.75} />
                Command center
              </Link>
            </Button>
          </div>
        }
      />

      {/* KPI strip — recognised vs deferred */}
      <Section eyebrow="Snapshot" title="Recognised vs deferred">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <MetricCard
            label="Sales recognised (at AJB)"
            value={formatUsdCompact(totals.salesRecognisedUsdMinor)}
            hint={`${totals.contractsTransferred} contract${totals.contractsTransferred === 1 ? "" : "s"} transferred`}
            accent
          />
          <MetricCard
            label="Sales deferred (pre-transfer)"
            value={formatUsdCompact(totals.salesDeferredUsdMinor)}
            hint={`${totals.contractsPending} awaiting AJB`}
          />
          <MetricCard
            label="Operating recognised"
            value={formatMoney(totals.streamRecognisedMinor, cur)}
            hint="Closed periods"
          />
          <MetricCard
            label="Operating deferred"
            value={formatMoney(totals.streamDeferredMinor, cur)}
            hint="Future periods"
          />
        </div>
      </Section>

      {/* AJB framing / next unlock note */}
      <Section
        eyebrow="Recognition trigger"
        title="AJB — notarial transfer of title"
      >
        <div className="rounded-lg border border-line-soft bg-surface p-5 flex flex-col gap-4">
          <div className="flex items-start gap-3">
            <span className="mt-0.5 rounded-md bg-accent-weak p-2 text-accent">
              <FileSignature className="w-4 h-4" strokeWidth={1.75} />
            </span>
            <p className="text-sm text-ink-secondary leading-relaxed max-w-3xl">
              Under the Indonesian leasehold/sale model, a contract&apos;s collected
              cash sits as a <span className="font-medium text-ink">deferred liability</span>{" "}
              (buyer deposit) until the <span className="font-medium text-ink">AJB</span>{" "}
              is executed before a notary, transferring title. At that point the
              accumulated cash is <span className="font-medium text-ink">recognised</span>{" "}
              as revenue. {totals.contractsPending} contract
              {totals.contractsPending === 1 ? "" : "s"} are currently pre-transfer.
            </p>
          </div>
          {nextUnlock ? (
            <div className="rounded-md border border-line-soft bg-muted/30 p-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-label">Next unlock</span>
                <span className="text-sm font-medium text-ink truncate">
                  {nextUnlock.projectName}
                  {nextUnlock.villaUnitCode ? ` · ${nextUnlock.villaUnitCode}` : ""}
                  {nextUnlock.contactName ? ` — ${nextUnlock.contactName}` : ""}
                </span>
                <span className="text-xs text-ink-tertiary">
                  {formatUsdCompact(nextUnlock.collectedUsdMinor)} collected of{" "}
                  {formatUsdCompact(nextUnlock.totalContractUsdMinor)} — recognises on AJB
                </span>
              </div>
              <Badge tone="warning">{nextUnlock.status.replace(/_/g, " ")}</Badge>
            </div>
          ) : (
            <p className="text-xs text-ink-tertiary">
              No pre-transfer contracts — all collected sale cash is recognised.
            </p>
          )}
        </div>
      </Section>

      {/* Streams-by-project table with recognised + deferred columns */}
      <Section eyebrow="By project" title="Recognised + deferred by project">
        {!hasData ? (
          <EmptyState
            title="No recognised or deferred revenue yet"
            description="Log operating streams below, or progress a sales contract to the AJB to recognise revenue. Seed via scripts/seed-dev-os.mjs."
          />
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Project</TH>
                <TH className="text-right">Sales recognised</TH>
                <TH className="text-right">Sales deferred</TH>
                <TH className="text-right">Op. recognised</TH>
                <TH className="text-right">Op. deferred</TH>
                <TH>Sales mix</TH>
              </TR>
            </THead>
            <TBody>
              {projects.map((p) => (
                <TR key={p.projectId}>
                  <TD>
                    <Link
                      href={`/development-os/projects/${p.projectSlug}`}
                      className="font-medium text-ink hover:text-accent"
                    >
                      {p.projectName}
                    </Link>
                    <div className="text-[11px] text-ink-tertiary">
                      {p.contractsTransferred} transferred · {p.contractsPending} pending
                    </div>
                  </TD>
                  <TDNum className="text-accent">
                    {formatUsdCompact(p.salesRecognisedUsdMinor)}
                  </TDNum>
                  <TDNum>{formatUsdCompact(p.salesDeferredUsdMinor)}</TDNum>
                  <TDNum>
                    {formatMoney(p.streamRecognisedMinor, p.streamCurrency)}
                  </TDNum>
                  <TDNum>
                    {formatMoney(p.streamDeferredMinor, p.streamCurrency)}
                  </TDNum>
                  <TD>
                    <MixBar
                      recognised={p.salesRecognisedUsdMinor}
                      deferred={p.salesDeferredUsdMinor}
                    />
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Section>

      {/* Recognition-mix progress bars */}
      <Section eyebrow="Mix" title="Recognition mix">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="rounded-lg border border-line-soft bg-surface p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Sales cash (USD)</span>
              <span className="text-xs text-ink-tertiary tabular-nums">
                {salesRecPct.toFixed(0)}% recognised
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full bg-accent"
                style={{ width: `${salesRecPct}%` }}
                aria-hidden
              />
            </div>
            <div className="flex items-center justify-between text-xs text-ink-tertiary">
              <span>
                <span className="text-accent font-medium">
                  {formatUsdCompact(totals.salesRecognisedUsdMinor)}
                </span>{" "}
                recognised
              </span>
              <span>{formatUsdCompact(totals.salesDeferredUsdMinor)} deferred</span>
            </div>
          </div>

          <div className="rounded-lg border border-line-soft bg-surface p-5 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-ink">
                Operating revenue ({cur})
              </span>
              <span className="text-xs text-ink-tertiary tabular-nums">
                {pct(totals.streamRecognisedMinor, streamTotal).toFixed(0)}% recognised
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden flex">
              <div
                className="h-full bg-accent"
                style={{
                  width: `${pct(totals.streamRecognisedMinor, streamTotal)}%`,
                }}
                aria-hidden
              />
            </div>
            <div className="flex items-center justify-between text-xs text-ink-tertiary">
              <span>
                <span className="text-accent font-medium">
                  {formatMoney(totals.streamRecognisedMinor, cur)}
                </span>{" "}
                recognised
              </span>
              <span>{formatMoney(totals.streamDeferredMinor, cur)} deferred</span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-ink-tertiary max-w-2xl">
          Operating figures are shown in {cur} and are not converted/summed across
          currencies. Sales figures are the contract ledger&apos;s USD reporting amounts.
        </p>
      </Section>
    </DevelopmentShell>
  );
}
