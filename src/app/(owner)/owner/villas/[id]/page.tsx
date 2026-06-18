import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getCurrentOwnerContext } from "@/features/owner-portal/owner-context";
import { getVillaForOwner } from "@/features/owner-portal/get-villa";
import { VillaHero, type VillaKpi } from "@/components/owner-portal/villa-hero";
import { PhotoGrid } from "@/components/owner-portal/photo-grid";
import { OccupancyBars } from "@/components/owner-portal/occupancy-bars";
import { MaintenanceLog } from "@/components/owner-portal/maintenance-log";

/**
 * Sprint OWNER-PORTAL · redesign owner-03 — Villa detail.
 *
 * Pixel port of cc-functional-handoff/cabinets/owner-p1/03-villas.html
 * (detail view). Wires the Phase 2.3 owner-03 primitives (VillaHero /
 * PhotoGrid / OccupancyBars / MaintenanceLog) to `getVillaForOwner`.
 *
 * This index page (/owner/villas/[id]) did not exist — only the
 * sub-routes (calendar / health / revenue / timeline) did — so the
 * VillaCard links from the home + villas list 404'd. This fills it.
 *
 * Layout: header band (eyebrow + 42px serif name) → hero (photo +
 * amenities + KPI strip) → gallery → occupancy bars + maintenance log
 * → contact strip.
 */

export const metadata = { title: "Villa" };
export const dynamic = "force-dynamic";

function fmtUsd(usd: number): string {
  if (Math.abs(usd) >= 1_000_000) return `$${(usd / 1_000_000).toFixed(2)}M`;
  if (Math.abs(usd) >= 1_000) return `$${(usd / 1_000).toFixed(1)}K`;
  return `$${Math.round(usd)}`;
}

export default async function OwnerVillaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const owner = await getCurrentOwnerContext();
  if (!owner) redirect("/dashboard");

  const data = await getVillaForOwner(owner.ownerId, id);
  if (!data) notFound();

  const { villa, photos, ytdStats, monthlyStats, recentMaintenance } = data;

  const kpis: VillaKpi[] = [
    { label: "YTD occupancy", value: `${ytdStats.occupancyPct}%`, tone: "ok" },
    { label: "YTD ADR", value: fmtUsd(ytdStats.adrUsd) },
    { label: "Net · MTD", value: fmtUsd(ytdStats.netUsd), tone: "terra" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="villa-detail-head">
        <Link
          href="/owner/villas"
          className="vd-eyebrow no-underline hover:text-terra"
        >
          ← Your villas
        </Link>
        <h1 className="vd-title">{villa.name}</h1>
      </div>

      <VillaHero
        heroImageUrl={villa.heroImageUrl}
        code={villa.code}
        name={villa.name}
        location={villa.location}
        feat={
          villa.bedrooms > 0
            ? villa.amenities.length > 0
              ? `A ${villa.bedrooms}-bedroom retreat with ${villa.amenities
                  .slice(0, 3)
                  .join(", ")
                  .toLowerCase()}.`
              : `A ${villa.bedrooms}-bedroom retreat.`
            : undefined
        }
        amenities={villa.amenities}
        kpis={kpis}
      />

      {photos.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="villa-gallery-head">
            <h2 className="vg-title">Gallery</h2>
            <span className="vg-link">
              {photos.length} photo{photos.length === 1 ? "" : "s"} · open all →
            </span>
          </div>
          <PhotoGrid
            photos={photos.map((p) => ({ id: p.id, url: p.url, alt: p.alt, caption: p.caption }))}
          />
        </section>
      )}

      <div className="villa-perf-row">
        {monthlyStats.length > 0 && (
          <section className="villa-panel">
            <div className="villa-panel-head">
              <h2 className="vp-title">Occupancy · last 6 months</h2>
              {ytdStats.occupancyPct > 0 && (
                <span className="vp-meta">{ytdStats.occupancyPct}% AVG</span>
              )}
            </div>
            <OccupancyBars bars={monthlyStats.map((m) => ({ label: m.monthLabel, pct: m.occupancyPct }))} />
          </section>
        )}

        <section className="villa-panel">
          <div className="villa-panel-head">
            <h2 className="vp-title">Recent maintenance</h2>
          </div>
          <MaintenanceLog
            entries={recentMaintenance.map((m) => ({
              id: m.id,
              date: m.date,
              summary: m.summary,
              costUsd: m.costUsd,
              status: m.status,
            }))}
            limit={5}
          />
        </section>
      </div>

      <section className="villa-contact">
        <div className="vc-copy">
          <div className="vc-headline">Want to change something about {villa.code}?</div>
          <p className="vc-sub">
            Photos, listing copy, pricing, amenities — reach the team and they&rsquo;ll handle it.
          </p>
        </div>
        <Link href="/owner/inbox" className="btn btn-secondary btn-sm">
          Message mgmt
        </Link>
        <Link href="/owner/preferences" className="btn btn-accent btn-sm">
          Schedule call
        </Link>
      </section>
    </div>
  );
}
