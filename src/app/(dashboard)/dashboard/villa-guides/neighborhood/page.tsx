import Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listNeighborhoodAdmin } from "@/features/villa-guides/services";

export const metadata = { title: "Neighborhood places" };
export const dynamic = "force-dynamic";

export default async function NeighborhoodList() {
  const rows = await listNeighborhoodAdmin();
  return (
    <div className="flex flex-col gap-10">
      <PageHeader
        breadcrumbs={[
          { label: "Villa guides", href: "/dashboard/villa-guides" },
          { label: "Neighborhood" },
        ]}
        title="Neighborhood places"
        description="Restaurants, cafes, beaches, transport links. Surfaced on /stay/[token]/neighborhood."
        actions={
          <Link
            href="/dashboard/villa-guides/neighborhood/new"
            className="text-sm px-3 py-1.5 rounded-sm border border-line-soft hover:border-line-strong"
          >
            + New place
          </Link>
        }
      />
      <Section eyebrow="Catalog" title={`${rows.length} places`}>
        {rows.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-soft bg-muted/20 px-5 py-6 text-sm text-ink-tertiary">
            None.
          </p>
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
