import _Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listNeighborhoodAdmin } from "@/features/villa-guides/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { VillaGuidesRowActions } from "@/components/dashboard/villa-guides/villa-guides-row-actions";
import { PlaceAddButton } from "@/components/villa-guides/place-add-button";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Neighborhood places" };
export const dynamic = "force-dynamic";

export default async function NeighborhoodList() {
  const [rows, villas, projects] = await Promise.all([
    listNeighborhoodAdmin(),
    listVillas(),
    listProjects(),
  ]);
  const villaOpts = villas.map((v) => ({ id: v.id, label: `${v.unitCode} · ${v.projectName ?? ""}` }));
  const projectOpts = projects.map((p) => ({ id: p.id, label: p.name }));
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Neighborhood" },
        ]}
        title="Neighborhood places"
        description="Restaurants, cafes, beaches, transport links. Surfaced on /stay/[token]/neighborhood."
        actions={<PlaceAddButton villas={villaOpts} projects={projectOpts} />}
      />
      <Section eyebrow="Catalog" title={`${rows.length} places`}>
        {rows.length === 0 ? (
          <NoItemsYet
            entityLabel="places"
            description="Add restaurants, cafes, beaches, and transport links so the guest stay app /neighborhood surface lights up."
            addHref="/dashboard/villa-guides/neighborhood/new"
            addLabel="+ New place"
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Category</th>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Distance</th>
                  <th className="text-left px-3 py-2">Visible</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-secondary text-xs">
                      {r.villaCode ?? r.projectName ?? "global"}
                    </td>
                    <td className="px-3 py-2 text-ink-tertiary">{r.category}</td>
                    <td className="px-3 py-2 text-ink font-medium">{r.name}</td>
                    <td className="px-3 py-2 text-ink-secondary">
                      {r.distanceLabel ?? "—"}
                      {r.travelTimeLabel ? ` · ${r.travelTimeLabel}` : ""}
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.guestVisible ? "success" : "neutral"}>
                        {r.guestVisible ? "guest" : "internal"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <VillaGuidesRowActions
                        kind="place"
                        row={{
                          id: r.id,
                          displayName: r.name,
                          values: {
                            villaId: r.villaId ?? "",
                            projectId: r.projectId ?? "",
                            name: r.name,
                            category: r.category,
                            descriptionMd: r.descriptionMd ?? "",
                            address: r.address ?? "",
                            googleMapsUrl: r.googleMapsUrl ?? "",
                            distanceLabel: r.distanceLabel ?? "",
                            travelTimeLabel: r.travelTimeLabel ?? "",
                            imageUrl: r.imageUrl ?? "",
                            sortOrder: r.sortOrder,
                            guestVisible: r.guestVisible,
                          },
                        }}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
