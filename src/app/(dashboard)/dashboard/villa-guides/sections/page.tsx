import Link from "next/link";
import { HandoffBadge, Card } from "@/components/dashboard/primitives";
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
      <div className="page-header">
        <div className="left">
          <div className="crumb">
            <Link href="/dashboard/villa-guides">Villa guides</Link> /{" "}
            <span>Sections</span>
          </div>
          <h1>Guide sections</h1>
          <p className="text-[13px] text-ink-3 mt-2 max-w-[680px]">
            Sections shown on /stay/[token]. The villa-scoped row wins when both
            villa- and project-scoped rows exist for the same key.
          </p>
        </div>
        <div className="actions">
          <SectionAddButton villas={villaOpts} projects={projectOpts} />
        </div>
      </div>
      <div>
        <div className="label mb-2.5">Catalog · {rows.length} sections</div>
        {rows.length === 0 ? (
          <NoItemsYet
            entityLabel="sections"
            description="Sections show up on the guest stay app at /stay/[token] — add your first one."
            addHref="/dashboard/villa-guides/sections/new"
            addLabel="+ New section"
          />
        ) : (
          <Card padding="none" overflowHidden>
            <table className="data">
              <thead>
                <tr>
                  <th scope="col">Scope</th>
                  <th scope="col">Section</th>
                  <th scope="col">Title</th>
                  <th scope="col" className="num">Sort</th>
                  <th scope="col">Visible</th>
                  <th scope="col">Status</th>
                  <th scope="col" />
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id}>
                    <td className="text-ink-3 text-xs">
                      {r.villaId
                        ? `villa ${r.villaId.slice(0, 8)}`
                        : r.projectId
                          ? `project ${r.projectId.slice(0, 8)}`
                          : "global"}
                    </td>
                    <td className="mono text-[11px]">{r.sectionKey}</td>
                    <td className="row-title">{r.title}</td>
                    <td className="num">{r.sortOrder}</td>
                    <td>
                      <HandoffBadge tone={r.guestVisible ? "ok" : "soft"}>
                        {r.guestVisible ? "guest" : "internal"}
                      </HandoffBadge>
                    </td>
                    <td>
                      <HandoffBadge tone={r.status === "active" ? "ok" : "soft"}>
                        {r.status}
                      </HandoffBadge>
                    </td>
                    <td className="text-right">
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
          </Card>
        )}
      </div>
    </div>
  );
}
