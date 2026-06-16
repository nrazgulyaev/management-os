import { notFound } from "next/navigation";
import Link from "next/link";
import { DetailPageHero } from "@/components/ui/primitives";
import { StatusPill } from "@/components/ui/status-pill";
import { Badge } from "@/components/ui/badge";
import { SourceBadge } from "@/components/ui/source-badge";
import { Button } from "@/components/ui/button";
import { ArchiveButton } from "@/components/admin/archive-button";
import { Pencil } from "lucide-react";
import { getVillaById } from "@/features/villas/services";
import { archiveVillaAction, unarchiveVillaAction } from "@/features/villas/actions";

export const metadata = { title: "Villa" };
export const dynamic = "force-dynamic";

export default async function VillaDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const villa = await getVillaById(id);
  if (!villa) notFound();

  return (
    <div className="flex flex-col gap-10">
      <DetailPageHero
        breadcrumbs={[
          { label: "Portfolio", href: "/dashboard" },
          { label: "Villas", href: "/dashboard/villas" },
          { label: villa.name ?? villa.unitCode },
        ]}
        eyebrow={villa.projectName}
        title={villa.name ?? villa.unitCode}
        description={`${villa.unitCode} · ${villa.bedrooms} bedrooms · ${villa.managementModel}`}
        statusRow={
          <>
            <SourceBadge source={villa.source} />
            <StatusPill status={villa.status} />
          </>
        }
        actions={
          <>
            {villa.source === "db" && (
              <ArchiveButton
                id={villa.id}
                action={
                  villa.status === "archived" ? unarchiveVillaAction : archiveVillaAction
                }
                archived={villa.status === "archived"}
              />
            )}
            <Button asChild variant="secondary">
              <Link href={`/dashboard/villas/${villa.id}/edit`}>
                <Pencil className="w-4 h-4" strokeWidth={1.75} />
                Edit
              </Link>
            </Button>
          </>
        }
        summaryStrip={[
          { label: "Bedrooms", value: villa.bedrooms.toString() },
          { label: "Bathrooms", value: villa.bathrooms?.toString() ?? "—" },
          {
            label: "Built area",
            value: villa.builtAreaSqm ? `${villa.builtAreaSqm} m²` : "—",
          },
          {
            label: "Nightly · USD",
            value:
              villa.currentNightlyRateUsd !== null
                ? `$${villa.currentNightlyRateUsd.toLocaleString()}`
                : "—",
          },
        ]}
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Bedrooms" value={villa.bedrooms.toString()} />
        <Stat label="Bathrooms" value={villa.bathrooms?.toString() ?? "—"} />
        <Stat label="Built area" value={villa.builtAreaSqm ? `${villa.builtAreaSqm} m²` : "—"} />
        <Stat label="Land area" value={villa.landAreaSqm ? `${villa.landAreaSqm} m²` : "—"} />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Stat label="Pool area" value={villa.poolAreaSqm ? `${villa.poolAreaSqm} m²` : "—"} />
        <Stat label="View" value={villa.viewType ?? "—"} />
        <Stat
          label="Nightly · USD"
          value={
            villa.currentNightlyRateUsd !== null
              ? `$${villa.currentNightlyRateUsd.toLocaleString()}`
              : "—"
          }
        />
        <Stat
          label="Owner-visible"
          value={
            villa.ownerVisible ? (
              <Badge tone="success">Visible</Badge>
            ) : (
              <Badge tone="neutral">Hidden</Badge>
            )
          }
        />
      </div>

      <div className="rounded-md border border-line-soft bg-muted/30 p-5">
        <span className="text-label">Next steps</span>
        <p className="text-sm text-ink-secondary mt-1.5 leading-relaxed">
          Bookings, owner statements, status events, and document attachments
          for this villa become editable here once their respective modules
          land (Versions 3–6 of the implementation roadmap).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link
            className="text-xs underline text-ink hover:text-accent"
            href={`/dashboard/bookings?villa=${villa.id}`}
          >
            View bookings →
          </Link>
          <Link
            className="text-xs underline text-ink hover:text-accent"
            href={`/dashboard/projects/${villa.projectSlug}`}
          >
            Back to project →
          </Link>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-md border border-line-soft bg-surface p-4">
      <div className="text-label">{label}</div>
      <div className="mt-1.5 text-sm text-ink">{value}</div>
    </div>
  );
}
