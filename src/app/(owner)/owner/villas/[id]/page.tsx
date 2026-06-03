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
 * Visual port of cc-handoff-bundle/cabinets/owner-p1/03-villas.html (the
 * detail view). Wires the Phase 2.3 owner-03 primitives (VillaHero /
 * PhotoGrid / OccupancyBars / MaintenanceLog) to `getVillaForOwner`.
 *
 * This index page (/owner/villas/[id]) did not exist — only the
 * sub-routes (calendar / health / revenue / timeline) did — so the
 * VillaCard links from the home + villas list 404'd. This fills it.
 *
 * Layout: eyebrow → hero (photo + amenities + KPI strip) → gallery →
 * occupancy bars + maintenance log → contact strip.
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
    { label: "Occupancy", value: `${ytdStats.occupancyPct}%` },
    { label: "ADR", value: fmtUsd(ytdStats.adrUsd) },
    { label: "Net · MTD", value: fmtUsd(ytdStats.netUsd) },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline gap-3">
        <Link
          href="/owner/villas"
          className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-tertiary no-underline hover:text-terra"
        >
          ← Your villas
        </Link>
      </div>

      <VillaHero
        heroImageUrl={villa.heroImageUrl}
        code={villa.code}
        name={villa.name}
        location={villa.location}
        amenities={villa.amenities}
        kpis={kpis}
      />

      {photos.length > 0 && (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline gap-3">
            <h2 className="display" style={{ fontSize: 24, fontWeight: 400, margin: 0, color: "var(--ink)" }}>
              Gallery
            </h2>
            <span className="ml-auto font-mono text-[11px] uppercase tracking-[0.08em] text-ink-tertiary">
              {photos.length} photo{photos.length === 1 ? "" : "s"}
            </span>
          </div>
          <PhotoGrid
            photos={photos.map((p) => ({ id: p.id, url: p.url, alt: p.alt, caption: p.caption }))}
          />
        </section>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[1.4fr_1fr] gap-4">
        <section className="rounded-[14px] border border-line-soft bg-surface p-6 flex flex-col gap-4">
          <div className="flex items-baseline gap-3">
            <h2 className="display" style={{ fontSize: 20, fontWeight: 400, margin: 0, color: "var(--ink)" }}>
              Occupancy · last 6 months
            </h2>
            {ytdStats.occupancyPct > 0 && (
              <span className="ml-auto font-mono text-[10.5px] tracking-[0.08em] text-ink-tertiary">
                {ytdStats.occupancyPct}% MTD
              </span>
            )}
          </div>
          <OccupancyBars bars={monthlyStats.map((m) => ({ label: m.monthLabel, pct: m.occupancyPct }))} />
        </section>

        <section className="rounded-[14px] border border-line-soft bg-surface p-6 flex flex-col gap-4">
          <h2 className="display" style={{ fontSize: 20, fontWeight: 400, margin: 0, color: "var(--ink)" }}>
            Recent maintenance
          </h2>
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

      <section
        className="rounded-[14px] border border-line-soft p-6 flex flex-wrap items-center gap-4"
        style={{ background: "linear-gradient(160deg, var(--cream-warm), transparent)" }}
      >
        <div className="flex-1 min-w-[240px]">
          <div className="display" style={{ fontSize: 18, color: "var(--ink)", fontWeight: 400 }}>
            Want to change something about {villa.code}?
          </div>
          <p className="text-[13px] text-ink-tertiary mt-1">
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
