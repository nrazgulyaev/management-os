import _Link from "next/link";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Section } from "@/components/ui/section";
import { listGuideSectionsAdmin } from "@/features/villa-guides/services";
import { listVillas } from "@/features/villas/services";
import { listProjects } from "@/features/projects/services";
import { VillaGuidesRowActions } from "@/components/dashboard/villa-guides/villa-guides-row-actions";
import { SectionAddButton } from "@/components/villa-guides/section-add-button";
import { NoItemsYet } from "@/components/ui/primitives";

export const metadata = { title: "Guide sections" };
export const dynamic = "force-dynamic";

export default async function SectionsList() {
  const [rows, villas, projects] = await Promise.all([
    listGuideSectionsAdmin(),
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
          { label: "Sections" },
        ]}
        title="Guide sections"
        description="Sections shown on /stay/[token]. The villa-scoped row wins when both villa- and project-scoped rows exist for the same key."
        actions={<SectionAddButton villas={villaOpts} projects={projectOpts} />}
      />
      <Section eyebrow="Catalog" title={`${rows.length} sections`}>
        {rows.length === 0 ? (
          <NoItemsYet
            entityLabel="sections"
            description="Sections show up on the guest stay app at /stay/[token] — add your first one."
            addHref="/dashboard/villa-guides/sections/new"
            addLabel="+ New section"
          />
        ) : (
          <div className="rounded-md border border-line-soft bg-surface overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/30 text-ink-tertiary text-[11px] uppercase tracking-widest">
                <tr>
                  <th className="text-left px-3 py-2">Scope</th>
                  <th className="text-left px-3 py-2">Section</th>
                  <th className="text-left px-3 py-2">Title</th>
                  <th className="text-right px-3 py-2">Sort</th>
                  <th className="text-left px-3 py-2">Visible</th>
                  <th className="text-left px-3 py-2">Status</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="px-3 py-2 text-ink-secondary text-xs">
                      {r.villaId
                        ? `villa ${r.villaId.slice(0, 8)}`
                        : r.projectId
                          ? `project ${r.projectId.slice(0, 8)}`
                          : "global"}
                    </td>
                    <td className="px-3 py-2 font-mono text-[11px]">{r.sectionKey}</td>
                    <td className="px-3 py-2 text-ink font-medium">{r.title}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.sortOrder}</td>
                    <td className="px-3 py-2">
                      <Badge tone={r.guestVisible ? "success" : "neutral"}>
                        {r.guestVisible ? "guest" : "internal"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2">
                      <Badge tone={r.status === "active" ? "success" : "neutral"}>
                        {r.status}
                      </Badge>
                    </td>
                    <td className="px-3 py-2 text-right">
                      <VillaGuidesRowActions
                        kind="section"
                        row={{
                          id: r.id,
                          displayName: r.title,
                          values: {
                            villaId: r.villaId ?? "",
                            projectId: r.projectId ?? "",
                            sectionKey: r.sectionKey,
                            title: r.title,
                            bodyMd: r.bodyMd ?? "",
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
