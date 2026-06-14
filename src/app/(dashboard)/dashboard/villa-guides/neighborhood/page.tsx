import Link from "next/link";
import { HandoffBadge, Card } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <span>Neighborhood</span>
          </div>
          <h1>Neighborhood places</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Restaurants, cafes, beaches, transport links. Surfaced on
            /stay/[token]/neighborhood.
          </p>
        </div>
        <div className="actions">
          <PlaceAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Catalog · {rows.length} places</div>
        {rows.length === 0 ? (
          <NoItemsYet
            entityLabel="places"
            description="Add restaurants, cafes, beaches, and transport links so the guest stay app /neighborhood surface lights up."
            addHref="/dashboard/villa-guides/neighborhood/new"
            addLabel="+ New place"
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">Category</th>
                  <th scope="col">Name</th>
                  <th scope="col">Distance</th>
                  <th scope="col">Visible</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink-3 text-xs">
                      {r.villaCode ?? r.projectName ?? "global"}
                    </td>
                    <td className="text-ink-3">{r.category}</td>
                    <td className="row-title">{r.name}</td>
                    <td>
                      {r.distanceLabel ?? "—"}
                      {r.travelTimeLabel ? ` · ${r.travelTimeLabel}` : ""}
                    </td>
                    <td>
                      <HandoffBadge tone={r.guestVisible ? "ok" : "soft"}>
                        {r.guestVisible ? "guest" : "internal"}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
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
          </Card>
        )}
      </div>
    </div>
  );
}
